-- ============================================================
-- Admin user ops (M11 mở rộng, 2026-07-12) — additive, KHÔNG đổi RLS/policy hiện có.
-- 1) txn_type_t +'adjust'  — admin TRỪ coin (chiều giảm); chiều CỘNG dùng 'bonus' có sẵn.
-- 2) transactions.note     — lý do chỉnh coin (bắt buộc ở route). User thấy note của chính mình
--    qua RLS SELECT own (minh bạch có chủ đích — không phải leak).
-- 3) RPC admin_adjust_coins — chỉnh coin atomic: conditional update (không cho âm, kèm DB CHECK
--    coins>=0 R3 làm defense-in-depth) + LUÔN ghi transactions (Rule.md: mọi thay đổi coin có ledger).
-- 4) RPC admin_dashboard_stats — số liệu thật cho dashboard admin (1 round-trip, service_role only).
-- security definer + service_role only (client KHÔNG execute); guard admin THẬT ở /api/admin/* route.
-- Rollback: drop function admin_adjust_coins(uuid,int,text); drop function admin_dashboard_stats();
--   alter table transactions drop column note; (enum value không drop được — vô hại nếu bỏ dùng)
-- ============================================================

alter type public.txn_type_t add value if not exists 'adjust';

alter table public.transactions add column if not exists note text;

create or replace function public.admin_adjust_coins(p_user_id uuid, p_delta integer, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_coins integer;
begin
  if p_delta is null or p_delta = 0 then
    return jsonb_build_object('status', 'INVALID_DELTA');
  end if;

  -- Conditional update: trừ quá số dư → 0 row (KHÔNG "đọc rồi ghi", chống race).
  update public.profiles
     set coins = coins + p_delta
   where id = p_user_id and coins + p_delta >= 0
   returning coins into v_coins;

  if not found then
    if not exists (select 1 from public.profiles where id = p_user_id) then
      return jsonb_build_object('status', 'USER_NOT_FOUND');
    end if;
    return jsonb_build_object('status', 'INSUFFICIENT_COINS');
  end if;

  -- Ledger bắt buộc: amount_coins luôn dương, type mang chiều (bonus = cộng, adjust = trừ).
  insert into public.transactions (user_id, amount_coins, type, status, note)
  values (
    p_user_id,
    abs(p_delta),
    case when p_delta > 0 then 'bonus'::public.txn_type_t else 'adjust'::public.txn_type_t end,
    'success'::public.txn_status_t,
    p_note
  );

  return jsonb_build_object('status', 'OK', 'coins', v_coins);
end;
$$;

revoke all on function public.admin_adjust_coins(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.admin_adjust_coins(uuid, integer, text) to service_role;

-- Số liệu dashboard admin — đếm/cộng bằng 1 call (tránh N query + tránh phụ thuộc PostgREST aggregate).
create or replace function public.admin_dashboard_stats()
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'tests_published',    (select count(*) from public.tests where status = 'published'),
    'tests_draft',        (select count(*) from public.tests where status = 'draft'),
    'tests_hidden',       (select count(*) from public.tests where status = 'hidden'),
    'products_published', (select count(*) from public.products where status = 'published'),
    'users',              (select count(*) from public.profiles),
    'attempts_submitted', (select count(*) from public.attempts where status in ('submitted','expired')),
    'topup_coins_success',(select coalesce(sum(amount_coins), 0) from public.transactions
                            where type = 'topup' and status = 'success')
  );
$$;

revoke all on function public.admin_dashboard_stats() from public, anon, authenticated;
grant execute on function public.admin_dashboard_stats() to service_role;
