-- ============================================================
-- EXAM-002 — Idempotency claim cho Writing grading. Trước đây writing_submissions KHÔNG có unique
--   trên attempt_id → chấm đồng thời tạo NHIỀU row (delete+insert non-atomic), getWritingResult
--   .maybeSingle() gặp >1 row → 500; provider bị gọi lặp (tốn tiền). Fix: unique(attempt_id) làm khoá
--   idempotency (server claim row placeholder trước khi gọi provider). Additive: dedupe dữ liệu bẩn
--   trước (giữ 1 row đã-chấm mới nhất / else mới nhất). Rollback: drop constraint.
-- ============================================================

-- Dedupe: mỗi attempt_id giữ 1 row — ưu tiên row đã có graded_at, mới nhất, else id lớn nhất.
delete from public.writing_submissions ws
 where ws.id not in (
   select distinct on (attempt_id) id
     from public.writing_submissions
    order by attempt_id, (graded_at is not null) desc, graded_at desc nulls last, id desc
 );

alter table public.writing_submissions
  add constraint writing_submissions_attempt_uniq unique (attempt_id);
