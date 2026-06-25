-- ============================================================
-- W10 Backend — AI grade usage atomic counter (M07).
-- Rate limit free user 1 lần/ngày: increment atomic, trả count mới.
-- security definer → chạy với quyền owner (service_role gọi qua RPC); client KHÔNG grant.
-- Idempotent: create or replace. Rollback: drop function reserve_ai_grade(uuid).
-- ============================================================

create or replace function public.reserve_ai_grade(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.ai_grade_usage (user_id, used_on, count)
  values (p_user_id, current_date, 1)
  on conflict (user_id, used_on)
  do update set count = public.ai_grade_usage.count + 1
  returning count into v_count;
  return v_count;
end;
$$;

-- Refund khi AI fail (best-effort): giảm count của hôm nay, không xuống dưới 0.
create or replace function public.refund_ai_grade(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ai_grade_usage
     set count = greatest(0, count - 1)
   where user_id = p_user_id and used_on = current_date;
end;
$$;

-- Client roles KHÔNG được gọi (chỉ service_role/server). Thu hồi execute mặc định.
revoke all on function public.reserve_ai_grade(uuid) from public, anon, authenticated;
revoke all on function public.refund_ai_grade(uuid) from public, anon, authenticated;
