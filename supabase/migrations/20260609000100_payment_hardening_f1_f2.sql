-- ============================================================
-- W19+ Backend — Payment hardening (review findings F1 + F2). ADDITIVE (create or replace).
-- Source: system review 2026-07-01 (staff security pass). Rollback = re-apply 20260606000100 bodies.
--
-- F1 (P2) — Late-but-valid webhook after reconciliation:
--   `expire_pending_topups` (20260608000100) đánh topup pending quá hạn → 'failed'.
--   `credit_topup` cũ CHỈ credit status='pending' → webhook hợp lệ đến MUỘN (bank transfer settle chậm)
--   gặp row đã 'failed' → KHÔNG credit → thu tiền thật mà KHÔNG cộng coin (mất tiền khách).
--   FIX: credit_topup nhận cả 'failed' (chỉ do reconcile đặt; webhook không tự set 'failed').
--        Webhook đã verify chữ ký + số tiền (route) → nguồn authoritative, override phán đoán reconcile.
--        Idempotency GIỮ NGUYÊN: một khi 'success' thì không match lại. amount verify ở route cũng nới sang 'failed'.
--
-- F2 (P3) — checkout mở product chưa published:
--   `checkout` cũ unlock mọi product `exists`, KHÔNG lọc status. cart_items có INSERT grant trực tiếp cho
--   authenticated (RLS check chỉ user_id) → user bypass /api/cart (vốn guard published) rồi checkout cart
--   để unlock DRAFT. Buy-now (checkoutProduct) đã guard published → bất nhất.
--   FIX: RPC chỉ nhận product status='published' (defense-in-depth, khớp buy-now). Exam gate vốn đã chặn
--        payload draft bằng RLS published, nên đây là siết nhất quán ở tầng tính tiền.
-- ============================================================

-- ---------- F2: Checkout — chỉ mở product PUBLISHED ----------
create or replace function public.checkout(p_user_id uuid, p_product_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_newly   uuid[];
  v_total   integer;
  v_order_id uuid;
begin
  if p_product_ids is null or array_length(p_product_ids, 1) is null then
    return jsonb_build_object('status', 'EMPTY_CART');
  end if;

  -- idempotency gate: claim unlock cho product chưa sở hữu (UNIQUE(user,product)). newly = thực sự mua.
  -- F2: CHỈ product status='published' (draft/hidden bị loại — không unlock, không tính tiền).
  with ins as (
    insert into public.product_unlocks (user_id, product_id, via)
    select p_user_id, pid, 'purchase'
      from (select distinct unnest(p_product_ids) as pid) u
     where exists (select 1 from public.products p where p.id = u.pid and p.status = 'published')
    on conflict (user_id, product_id) do nothing
    returning product_id
  )
  select coalesce(array_agg(product_id), '{}') into v_newly from ins;

  if array_length(v_newly, 1) is null then
    return jsonb_build_object('status', 'ALREADY_OWNED');
  end if;

  -- server đọc giá (KHÔNG tin client). total = sum price_coins của newly.
  select coalesce(sum(price_coins), 0) into v_total from public.products where id = any(v_newly);

  -- conditional coin: trừ chỉ khi đủ. 0 row ⇒ thiếu → compensate (xoá unlock vừa claim).
  update public.profiles set coins = coins - v_total
   where id = p_user_id and coins >= v_total;
  if not found then
    delete from public.product_unlocks where user_id = p_user_id and product_id = any(v_newly);
    return jsonb_build_object('status', 'INSUFFICIENT_COINS');
  end if;

  -- order + items snapshot + ledger (spend = âm) + link unlock → order.
  insert into public.orders (user_id, total_coins, status)
  values (p_user_id, v_total, 'paid') returning id into v_order_id;

  insert into public.order_items (order_id, product_id, price_coins, quantity)
  select v_order_id, p.id, p.price_coins, 1 from public.products p where p.id = any(v_newly);

  insert into public.transactions (user_id, amount_coins, type, order_id, provider, status)
  values (p_user_id, -v_total, 'spend', v_order_id, 'system', 'success');

  update public.product_unlocks set order_id = v_order_id
   where user_id = p_user_id and product_id = any(v_newly) and order_id is null;

  insert into public.test_unlocks (user_id, test_id, product_id)
  select p_user_id, ct.test_id, ct.product_id from public.collection_tests ct
   where ct.product_id = any(v_newly)
  on conflict (user_id, test_id, product_id) do nothing;

  return jsonb_build_object('status', 'OK', 'total', v_total, 'order_id', v_order_id);
end;
$$;

-- ---------- F1: Topup webhook credit — phục hồi cả topup 'failed' (bị reconcile dọn) khi webhook hợp lệ đến muộn ----------
create or replace function public.credit_topup(p_provider public.provider_t, p_txn_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_amount integer;
begin
  -- F1: nhận 'pending' HOẶC 'failed'. 'failed' chỉ do expire_pending_topups đặt (webhook status!='success'
  --   thì route trả sớm, KHÔNG ghi DB) → coi như "pending quá hạn nhưng thực tế đã trả" → credit đúng.
  --   status guard vẫn là idempotency gate: một khi 'success' thì UPDATE này không match nữa (credited=false).
  update public.transactions set status = 'success'
   where provider = p_provider and provider_txn_id = p_txn_id and type = 'topup'
     and status in ('pending', 'failed')
   returning user_id, amount_coins into v_user, v_amount;
  if not found then return jsonb_build_object('status', 'OK', 'credited', false); end if; -- đã xử lý / không có row hợp lệ
  update public.profiles set coins = coins + v_amount where id = v_user;
  return jsonb_build_object('status', 'OK', 'credited', true, 'amount', v_amount);
end;
$$;

-- Re-assert execute grants (create or replace giữ nguyên privilege cũ; ghi lại cho self-contained + rõ ràng).
revoke all on function public.checkout(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.credit_topup(public.provider_t, text) from public, anon, authenticated;
grant execute on function public.checkout(uuid, uuid[]) to service_role;
grant execute on function public.credit_topup(public.provider_t, text) to service_role;
