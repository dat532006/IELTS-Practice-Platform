-- ============================================================
-- EXAM-003 / EXAM-009 — Snapshot nội dung đề lúc START (đóng băng thứ người học THỰC SỰ thấy).
-- Review đọc từ đây (getResult, service_role) → độc lập published visibility (003: đề ẩn vẫn xem lại được)
--   + cố định khi đề bị sửa (009: đúng/sai/evidence không trôi). Attempt cũ không có bản ghi → getResult
--   fallback nội dung hiện tại + cờ stale.
-- passages/questions KHÔNG chứa answer_keys (bảng riêng) → an toàn hiển thị như /api/exam. service_role-only
--   (như payment_exceptions/cron_runs): RLS on, KHÔNG policy client → deny anon/authenticated.
-- on delete cascade theo attempt. Rollback: drop table public.attempt_content_snapshots;
-- ============================================================
create table if not exists public.attempt_content_snapshots (
  attempt_id  uuid primary key references public.attempts(id) on delete cascade,
  test_id     uuid not null references public.tests(id),
  passages    jsonb,
  questions   jsonb,
  captured_at timestamptz not null default now()
);

alter table public.attempt_content_snapshots enable row level security;
grant select, insert on public.attempt_content_snapshots to service_role;
