-- ============================================================
-- DEPLOY-001 — Observability cho cron reconcile. Trước đây cron thất bại/miss chỉ để lại response/log
--   ephemeral (Vercel) → không truy được lịch sử run trong repo/DB. Thêm bảng cron_runs (audit bền):
--   mỗi lần cron chạy ghi 1 dòng {job, ok, detail}. Route ghi best-effort (audit lỗi KHÔNG làm hỏng job).
--   Alert/dashboard dựa trên bảng này = Owner (platform). expire_pending_topups vẫn idempotent (không đụng).
-- Additive & service_role-only (như payment_exceptions). Rollback: drop table public.cron_runs;
-- ============================================================
create table if not exists public.cron_runs (
  id      uuid primary key default gen_random_uuid(),
  job     text not null,
  ran_at  timestamptz not null default now(),
  ok      boolean not null,
  detail  jsonb not null default '{}'::jsonb,
  constraint cron_runs_job_chk check (job <> '')
);

-- Truy vấn "run gần nhất theo job" + "các run lỗi" rẻ.
create index if not exists cron_runs_job_ran_idx on public.cron_runs (job, ran_at desc);
create index if not exists cron_runs_failed_idx on public.cron_runs (ran_at desc) where ok = false;

-- RLS on, KHÔNG policy client → deny anon/authenticated. Chỉ service_role (cron route + admin đọc) thấy.
alter table public.cron_runs enable row level security;
grant select, insert on public.cron_runs to service_role;
