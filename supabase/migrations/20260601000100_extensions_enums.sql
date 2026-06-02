-- ============================================================
-- W1+2 Backend — Extensions & ENUM types
-- Source: IELTS_Platform_Project_Plan.md v1.6 §3
-- ============================================================

create extension if not exists pgcrypto;   -- gen_random_uuid (PG13+ has it builtin; kept for safety/HMAC utils)

create type public.plan_t            as enum ('free','pro');
create type public.role_t            as enum ('user','admin');
create type public.test_type_t       as enum ('reading','listening','writing');
create type public.test_status_t     as enum ('draft','published','hidden');
create type public.product_kind_t    as enum ('bundle','single');
create type public.product_status_t  as enum ('draft','published','hidden');
create type public.score_band_type_t as enum ('reading','listening');   -- subset: chỉ R/L có quy đổi band
create type public.attempt_status_t  as enum ('in_progress','submitted','expired');
create type public.order_status_t    as enum ('pending','paid','cancelled','refunded');
create type public.txn_type_t        as enum ('topup','spend','refund','bonus');
create type public.provider_t        as enum ('vnpay','momo','bank','system');
create type public.txn_status_t      as enum ('pending','success','failed');
create type public.unlock_via_t      as enum ('purchase','redeem');
create type public.code_status_t     as enum ('active','disabled');
