-- ============================================================
-- EXAM-004 — Optimistic concurrency cho draft answers.
-- Thêm answers_rev: tăng mỗi lần answers được GHI THẮNG (autosave/submit). Client giữ rev đã thấy, gửi
--   expected_rev; server dùng conditional UPDATE `.eq('answers_rev', current)` (atomic dưới row-lock) để
--   chống tab CŨ đè autosave/submit của tab MỚI (mất đáp án âm thầm). Lệch rev → route trả 409 ANSWERS_STALE.
-- Additive, default 0 → attempt cũ an toàn (client cũ không gửi expected_rev vẫn ghi được, không regression).
-- Rollback: alter table public.attempts drop column answers_rev;
-- ============================================================
alter table public.attempts add column if not exists answers_rev integer not null default 0;
