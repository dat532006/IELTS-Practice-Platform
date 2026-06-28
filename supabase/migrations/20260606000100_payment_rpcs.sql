-- ============================================================
-- W15 Backend — Payment/Redeem atomic RPCs (M08).
-- Source: docs/Architecture/payment_redeem_contract.md §1/§2/§3.
-- Mọi flow chạy trong 1 transaction (function) → atomic + race-safe.
-- security definer: chạy quyền owner; service_role gọi qua RPC (request.jwt.claims.role=service_role
--   → trigger lock_sensitive_cols cho phép update coins). client KHÔNG execute (revoke).
-- KHÔNG tin giá/coin client: server đọc products.price_coins; conditional UPDATE coin.
-- Idempotency: UNIQUE(user,product) / UNIQUE(code_id,user) / UNIQUE(provider,provider_txn_id) gates.
-- Rollback: drop function redeem_activation_code(uuid,text), checkout(uuid,uuid[]), credit_topup(uuid,provider_t,text,integer).
-- ============================================================

-- ---------- Redeem (§2): HMAC code_hash → unlock product + expand test_unlocks ----------
create or replace function public.redeem_activation_code(p_user_id uuid, p_code_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_code   public.activation_codes%rowtype;
  v_red_id uuid;
  v_upd    uuid;
begin
  select * into v_code from public.activation_codes where code_hash = p_code_hash;
  if not found then return jsonb_build_object('status', 'CODE_NOT_FOUND'); end if;
  if v_code.status <> 'active' then return jsonb_build_object('status', 'CODE_DISABLED'); end if;
  if v_code.expires_at is not null and v_code.expires_at < now() then
    return jsonb_build_object('status', 'CODE_EXPIRED');
  end if;

  -- idempotency gate: claim (code,user). Conflict ⇒ user đã redeem mã này → already_unlocked (count KHÔNG tăng).
  insert into public.redemptions (code_id, user_id, product_id)
  values (v_code.id, p_user_id, v_code.product_id)
  on conflict (code_id, user_id) do nothing
  returning id into v_red_id;
  if v_red_id is null then
    return jsonb_build_object('status', 'already_unlocked', 'product_id', v_code.product_id);
  end if;

  -- conditional counter: chỉ tăng khi còn slot. 0 row ⇒ sold out → compensate (xoá redemption vừa claim).
  update public.activation_codes
     set redeemed_count = redeemed_count + 1
   where id = v_code.id and status = 'active' and redeemed_count < max_redemptions
   returning id into v_upd;
  if v_upd is null then
    delete from public.redemptions where id = v_red_id;
    return jsonb_build_object('status', 'CODE_SOLD_OUT');
  end if;

  -- unlock product (cờ DTO) + expand test_unlocks (LUẬT THÉP #3: payload chỉ mở qua test_unlocks).
  insert into public.product_unlocks (user_id, product_id, via, redemption_id)
  values (p_user_id, v_code.product_id, 'redeem', v_red_id)
  on conflict (user_id, product_id) do nothing;

  insert into public.test_unlocks (user_id, test_id, product_id)
  select p_user_id, ct.test_id, v_code.product_id
    from public.collection_tests ct
   where ct.product_id = v_code.product_id
  on conflict (user_id, test_id, product_id) do nothing;

  return jsonb_build_object('status', 'OK', 'product_id', v_code.product_id);
end;
$$;

-- ---------- Checkout (§1): cart → conditional coin → unlock + expand ----------
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
  with ins as (
    insert into public.product_unlocks (user_id, product_id, via)
    select p_user_id, pid, 'purchase'
      from (select distinct unnest(p_product_ids) as pid) u
     where exists (select 1 from public.products p where p.id = u.pid)
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

-- ---------- Topup webhook (§3): pending→success + cộng coin (amount SERVER-side, KHÔNG tin webhook), idempotent ----------
-- payment/create đã insert transactions(type='topup', status='pending', provider, provider_txn_id, amount).
-- webhook (sau verify chữ ký) gọi hàm này: chỉ pending mới được credit (status guard) → idempotent.
create or replace function public.credit_topup(p_provider public.provider_t, p_txn_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_amount integer;
begin
  update public.transactions set status = 'success'
   where provider = p_provider and provider_txn_id = p_txn_id and type = 'topup' and status = 'pending'
   returning user_id, amount_coins into v_user, v_amount;
  if not found then return jsonb_build_object('status', 'OK', 'credited', false); end if; -- đã xử lý / không có pending
  update public.profiles set coins = coins + v_amount where id = v_user;
  return jsonb_build_object('status', 'OK', 'credited', true, 'amount', v_amount);
end;
$$;

-- Client roles KHÔNG execute (chỉ service_role/server). Revoke mặc định (PG grant EXECUTE cho PUBLIC),
--   rồi GRANT lại EXECUTE cho service_role (revoke from public cũng gỡ của service_role).
revoke all on function public.redeem_activation_code(uuid, text) from public, anon, authenticated;
revoke all on function public.checkout(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.credit_topup(public.provider_t, text) from public, anon, authenticated;
grant execute on function public.redeem_activation_code(uuid, text) to service_role;
grant execute on function public.checkout(uuid, uuid[]) to service_role;
grant execute on function public.credit_topup(public.provider_t, text) to service_role;
