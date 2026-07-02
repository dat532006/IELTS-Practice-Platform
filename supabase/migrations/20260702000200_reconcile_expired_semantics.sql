-- ============================================================
-- PostW19 Backend — Review fixes B-03 + B-07 (bước 2/2). ADDITIVE (create or replace).
-- Source: backend security review 2026-07-02.
--
-- B-03 (P3) — Tách ngữ nghĩa 'expired' khỏi 'failed':
--   Trước đây reconcile (expire_pending_topups) đánh pending quá hạn → 'failed', và credit_topup (F1)
--   phục hồi cả 'failed'. An toàn của F1 dựa trên bất biến NGẦM "chỉ reconcile mới set failed"
--   (webhook non-success return sớm, không ghi DB). Khi cắm adapter cổng thật (A1), nếu code tương lai
--   ghi 'failed' cho notification thất bại của provider → webhook retry hợp lệ vẫn credit → SAI.
--   FIX: reconcile đánh 'expired' (giá trị mới, backend-internal); credit_topup chỉ phục hồi
--        ('pending','expired'). 'failed' từ nay = provider-failed → KHÔNG BAO GIỜ credit lại.
--   Backfill: mọi topup 'failed' hiện có đều do reconcile cũ đặt (webhook cũ không ghi failed) → 'expired'.
--
-- B-07 (P3) — checkout đọc products.price_coins MỘT LẦN:
--   Bản cũ đọc giá 2 lần trong 1 tx (sum tổng + snapshot order_items) — admin đổi giá đúng giữa 2
--   statement (READ COMMITTED) có thể làm orders.total_coins ≠ Σ order_items.price_coins (lệch audit).
--   FIX: snapshot vào order_items TRƯỚC (đọc giá đúng 1 lần), total = Σ từ chính snapshot đó.
--   Hành vi giữ nguyên: EMPTY_CART / published-only (F2) / ALREADY_OWNED / INSUFFICIENT_COINS+compensate /
--   ledger 'spend' / link unlock→order / expand test_unlocks.
--
-- Rollback: re-apply body 20260608000100 (expire→failed) + 20260609000100 (credit failed, checkout 2-read).
-- ============================================================

-- ---------- B-03 backfill: topup 'failed' hiện có = reconcile cũ đặt → chuyển 'expired' ----------
update public.transactions set status = 'expired' where type = 'topup' and status = 'failed';

-- ---------- B-03: reconcile đánh 'expired' (KHÔNG phải 'failed') ----------
create or replace function public.expire_pending_topups(p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  update public.transactions
     set status = 'expired'
   where type = 'topup'
     and status = 'pending'
     and expires_at is not null
     and expires_at < p_now;
  get diagnostics v_count = row_count;
  return jsonb_build_object('status', 'OK', 'expired', v_count);
end;
$$;

-- ---------- B-03: credit_topup phục hồi 'pending' | 'expired' — 'failed' (provider) KHÔNG credit ----------
create or replace function public.credit_topup(p_provider public.provider_t, p_txn_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_amount integer;
begin
  -- 'expired' = reconcile dọn pending quá hạn nhưng webhook hợp lệ đến muộn → credit đúng (F1).
  -- 'failed'  = provider báo thất bại (adapter A1) → KHÔNG match → credited=false (chống credit sai).
  -- status guard vẫn là idempotency gate: một khi 'success' thì UPDATE này không match nữa.
  update public.transactions set status = 'success'
   where provider = p_provider and provider_txn_id = p_txn_id and type = 'topup'
     and status in ('pending', 'expired')
   returning user_id, amount_coins into v_user, v_amount;
  if not found then return jsonb_build_object('status', 'OK', 'credited', false); end if;
  update public.profiles set coins = coins + v_amount where id = v_user;
  return jsonb_build_object('status', 'OK', 'credited', true, 'amount', v_amount);
end;
$$;

-- ---------- B-07: checkout — snapshot giá 1 lần, total từ snapshot ----------
create or replace function public.checkout(p_user_id uuid, p_product_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_newly    uuid[];
  v_total    integer;
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

  -- B-07: tạo order (pending) + snapshot giá vào order_items — products.price_coins đọc ĐÚNG 1 LẦN;
  --   total tính từ chính snapshot → orders.total_coins LUÔN = Σ order_items.price_coins.
  insert into public.orders (user_id, total_coins, status)
  values (p_user_id, 0, 'pending') returning id into v_order_id;

  insert into public.order_items (order_id, product_id, price_coins, quantity)
  select v_order_id, p.id, p.price_coins, 1 from public.products p where p.id = any(v_newly);

  select coalesce(sum(price_coins), 0) into v_total
    from public.order_items where order_id = v_order_id;

  -- conditional coin: trừ chỉ khi đủ. 0 row ⇒ thiếu → compensate (xoá unlock + order vừa claim).
  update public.profiles set coins = coins - v_total
   where id = p_user_id and coins >= v_total;
  if not found then
    delete from public.product_unlocks where user_id = p_user_id and product_id = any(v_newly);
    delete from public.order_items where order_id = v_order_id;
    delete from public.orders where id = v_order_id;
    return jsonb_build_object('status', 'INSUFFICIENT_COINS');
  end if;

  -- finalize order + ledger (spend = âm) + link unlock → order + expand test_unlocks.
  update public.orders set total_coins = v_total, status = 'paid' where id = v_order_id;

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

-- Re-assert execute grants (create or replace giữ privilege cũ; ghi lại cho self-contained + rõ ràng).
revoke all on function public.expire_pending_topups(timestamptz) from public, anon, authenticated;
revoke all on function public.credit_topup(public.provider_t, text) from public, anon, authenticated;
revoke all on function public.checkout(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.expire_pending_topups(timestamptz) to service_role;
grant execute on function public.credit_topup(public.provider_t, text) to service_role;
grant execute on function public.checkout(uuid, uuid[]) to service_role;
