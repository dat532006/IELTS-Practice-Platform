-- ============================================================
-- ⚠️ LOCAL TEST SHIM ONLY — KHÔNG chạy trên Supabase thật.
-- Giả lập môi trường Supabase (auth schema, roles, auth.uid()) để test
-- migration + RLS trên Postgres vanilla (Docker). Supabase đã có sẵn các thứ này.
-- ============================================================

create extension if not exists pgcrypto;

create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at         timestamptz default now()
);

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon')          then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role')  then create role service_role nologin bypassrls; end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth   to anon, authenticated, service_role;

-- service_role nhận full quyền trên các bảng tạo sau (mimic Supabase)
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;

-- auth.uid() đọc claim 'sub' từ request.jwt.claims (giống Supabase)
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')::uuid
$$;
