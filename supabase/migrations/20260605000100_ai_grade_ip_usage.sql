-- ============================================================
-- W11 Backend — AI grade IP daily counter (M07/M12).
-- Basic anti-abuse layer in addition to per-user ai_grade_usage.
-- Stores hashed IP only; raw IP stays in server memory and is never returned.
-- RPC increments atomically only while below caller-provided limit.
-- Rollback: drop functions reserve_ai_grade_ip(text, integer), refund_ai_grade_ip(text); drop table ai_grade_ip_usage.
-- ============================================================

create table if not exists public.ai_grade_ip_usage (
  id      uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  used_on date not null default current_date,
  count   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ip_hash, used_on),
  check (char_length(ip_hash) between 32 and 128),
  check (count >= 0)
);

alter table public.ai_grade_ip_usage enable row level security;

revoke all on public.ai_grade_ip_usage from public, anon, authenticated;

drop policy if exists ai_grade_ip_usage_deny_all on public.ai_grade_ip_usage;
create policy ai_grade_ip_usage_deny_all on public.ai_grade_ip_usage
  for all to anon, authenticated using (false) with check (false);

create or replace function public.reserve_ai_grade_ip(p_ip_hash text, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 500));
begin
  if p_ip_hash is null or char_length(p_ip_hash) < 32 or char_length(p_ip_hash) > 128 then
    raise exception 'invalid ip hash';
  end if;

  insert into public.ai_grade_ip_usage (ip_hash, used_on, count)
  values (p_ip_hash, current_date, 1)
  on conflict (ip_hash, used_on)
  do update set
    count = public.ai_grade_ip_usage.count + 1,
    updated_at = now()
  where public.ai_grade_ip_usage.count < v_limit
  returning count into v_count;

  return coalesce(v_count, v_limit + 1);
end;
$$;

create or replace function public.refund_ai_grade_ip(p_ip_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ai_grade_ip_usage
     set count = greatest(0, count - 1),
         updated_at = now()
   where ip_hash = p_ip_hash and used_on = current_date;
end;
$$;

revoke all on function public.reserve_ai_grade_ip(text, integer) from public, anon, authenticated;
revoke all on function public.refund_ai_grade_ip(text) from public, anon, authenticated;
