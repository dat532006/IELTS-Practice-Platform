-- ============================================================
-- Admin grant (M11) — RPC admin_grant_products: owner cấp product trực tiếp cho 1 tài khoản.
-- KHÁC checkout: KHÔNG trừ xu, KHÔNG tạo order/ledger (đây là "tặng"/cấp quyền, không phải giao dịch mua).
-- GIỐNG checkout: unlock (product_unlocks) + expand test_unlocks (LUẬT THÉP #3 — payload chỉ mở qua test_unlocks).
-- Atomic + idempotent (UNIQUE(user,product) / UNIQUE(user,test,product)); chạy lại an toàn (backfill test_unlocks).
-- security definer + service_role only (client KHÔNG execute). Guard admin THẬT ở /api/admin/* (route).
-- Rollback: drop function public.admin_grant_products(uuid, uuid[]);
-- ============================================================
create or replace function public.admin_grant_products(p_user_id uuid, p_product_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_newly uuid[];
begin
  if p_product_ids is null or array_length(p_product_ids, 1) is null then
    return jsonb_build_object('status', 'EMPTY');
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    return jsonb_build_object('status', 'USER_NOT_FOUND');
  end if;

  -- claim unlock cho product tồn tại + user CHƯA sở hữu. newly = số gói thực sự mới cấp (đã sở hữu ⇒ bỏ qua).
  with ins as (
    insert into public.product_unlocks (user_id, product_id, via)
    select p_user_id, pid, 'admin'
      from (select distinct unnest(p_product_ids) as pid) u
     where exists (select 1 from public.products p where p.id = u.pid)
    on conflict (user_id, product_id) do nothing
    returning product_id
  )
  select coalesce(array_agg(product_id), '{}') into v_newly from ins;

  -- expand test_unlocks cho TẤT CẢ product được yêu cầu (backfill kể cả gói đã sở hữu từ trước).
  insert into public.test_unlocks (user_id, test_id, product_id)
  select p_user_id, ct.test_id, ct.product_id
    from public.collection_tests ct
   where ct.product_id = any(p_product_ids)
  on conflict (user_id, test_id, product_id) do nothing;

  return jsonb_build_object(
    'status', 'OK',
    'granted', coalesce(array_length(v_newly, 1), 0),
    'requested', array_length(p_product_ids, 1)
  );
end;
$$;

-- Client roles KHÔNG execute (chỉ service_role qua route đã requireAdmin).
revoke all on function public.admin_grant_products(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.admin_grant_products(uuid, uuid[]) to service_role;
