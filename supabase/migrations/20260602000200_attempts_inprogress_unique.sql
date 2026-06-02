-- ============================================================
-- W5 Backend — chống race tạo nhiều attempt in_progress (M05).
-- unique(user_id,test_id,started_at) KHÔNG chặn 2 request start đồng thời (khác started_at).
-- Partial unique index đảm bảo TỐI ĐA 1 attempt in_progress / (user,test) tại một thời điểm.
-- Terminal (submitted/expired) KHÔNG bị ràng buộc → vẫn cho retake nhiều lần.
-- Route start: insert đụng index (23505) → reselect attempt in_progress hiện có (idempotent).
-- ============================================================

create unique index if not exists idx_attempts_one_inprogress
  on public.attempts (user_id, test_id)
  where status = 'in_progress';
