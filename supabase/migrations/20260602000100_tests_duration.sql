-- ============================================================
-- W4 Backend — tests.duration_sec (pre-exam metadata)
-- DTO docs/TaskBrief/BackendEngineer/phase1/w4.md Task 4.2 yêu cầu `duration_sec`,
-- schema W1+2 chưa có cột này → thêm + cấp column-grant để client đọc như metadata khác.
-- KHÔNG ảnh hưởng premium payload: passages/questions VẪN không grant cho client.
-- (Tách migration riêng vì grant W1+2 ở 000400 đã "đóng băng".)
-- ============================================================

alter table public.tests add column if not exists duration_sec integer;

-- Column-grant: anon/authenticated đọc được duration_sec (metadata an toàn, không phải payload).
grant select (duration_sec) on public.tests to anon, authenticated;
