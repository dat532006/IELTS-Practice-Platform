-- ============================================================
-- W1+2 Backend — Chặn cột nhạy cảm profiles (fix P0)
-- Source: plan v1.6 §11.1. RLS kiểm soát HÀNG, KHÔNG kiểm soát CỘT.
-- Hai tầng: (1) column-grant, (2) trigger phòng thủ.
-- ============================================================

-- Tầng 1 — column privilege: authenticated chỉ UPDATE name, avatar
revoke update on public.profiles from authenticated;
grant  update (name, avatar) on public.profiles to authenticated;

-- Tầng 2 — trigger: chặn đổi role/coins/plan kể cả khi lọt.
-- ⚠️ COALESCE vì khi không có JWT claims, current_setting trả NULL →
--    "NULL <> 'service_role'" = NULL (không raise) → hở. Phải COALESCE về ''.
create or replace function public.lock_sensitive_cols()
returns trigger language plpgsql as $$
begin
  if new.role <> old.role or new.coins <> old.coins or new.plan <> old.plan then
    if coalesce(
         current_setting('request.jwt.claims', true)::jsonb->>'role', ''
       ) <> 'service_role' then
      raise exception 'Không được phép thay đổi role/coins/plan';
    end if;
  end if;
  return new;
end $$;

create trigger trg_lock_sensitive_cols
  before update on public.profiles
  for each row execute function public.lock_sensitive_cols();
