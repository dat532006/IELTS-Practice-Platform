-- ============================================================
-- W19+ Backend — Defense-in-depth: profiles.coins KHÔNG BAO GIỜ âm (review finding R3). ADDITIVE.
-- Source: system review 2026-07-01 (staff security pass, cross-check contracts).
--
-- R3 (P3) — Non-negativity của coin hiện CHỈ dựa vào conditional UPDATE ở tầng app
--   (checkout RPC: `... where id=uid and coins >= v_total`). Không có guard tầng DB.
--   Bất kỳ path trừ coin tương lai quên điều kiện → coins âm = premium free. Thêm CHECK ở DB để
--   fail-closed vĩnh viễn (constraint áp cho MỌI role, kể cả service_role/superuser — không bypass được).
-- Re-runnable (guard qua pg_constraint). Rollback: alter table public.profiles drop constraint profiles_coins_nonneg;
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_coins_nonneg'
  ) then
    alter table public.profiles
      add constraint profiles_coins_nonneg check (coins >= 0);
  end if;
end $$;
