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
  banned_until       timestamptz,           -- Supabase thật có cột này (ban_duration); SEC-001 is_user_banned() đọc.
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

-- ============================================================
-- TEST-005 — Storage shim: trước đây shim KHÔNG có schema `storage` → 2 migration bucket
--   (avatars/media) NO-OP qua guard to_regclass → policy Storage KHÔNG được tạo/kiểm mà gate vẫn
--   báo "ALL PASSED" (giả). Thêm bản tối giản storage.buckets/objects/foldername + RLS để nhánh
--   storage của migration CHẠY THẬT → policy được tạo → storage_policy_check.sql kiểm được.
--   Supabase thật đã có sẵn schema này; shim CHỈ dùng local (Docker).
-- ============================================================
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets(id),
  name       text,
  owner      uuid,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;

-- storage.foldername(name): trả mảng thư mục (path bỏ tên file) — [1] = thư mục đầu = '<uid>'.
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)]
$$;
