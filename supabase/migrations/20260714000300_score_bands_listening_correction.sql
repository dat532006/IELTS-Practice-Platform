-- ============================================================
-- EXAM-001 — Corrective Listening band table. Bảng listening cũ (migration 20260603000200) LỆCH
--   tại 4 điểm: raw 18,19 → 5.5 (đúng 5.0), 26 → 6.5 (đúng 6.0), 32 → 7.5 (đúng 7.0). Bảng đúng =
--   IELTS Academic (giống Reading Academic 3..40, migration 20260602000300). KHÔNG sửa migration cũ đã
--   áp dụng — thêm migration corrective, delete-insert SCOPED test_type='listening' → hội tụ idempotent
--   về đúng bảng (cả DB đã seed sai lẫn DB reset). KHÔNG đụng reading / general training.
--   Raw 0..2 CỐ Ý không map (Owner chưa chốt) — giữ nguyên hiện trạng. Rollback: forward-only, KHÔNG
--   bao giờ quay lại bảng sai đã biết; remediation attempts lịch sử là quyết định Owner riêng.
-- ============================================================

delete from public.score_bands where test_type = 'listening';

insert into public.score_bands (test_type, raw_min, raw_max, band) values
  ('listening', 39, 40, 9.0),
  ('listening', 37, 38, 8.5),
  ('listening', 35, 36, 8.0),
  ('listening', 33, 34, 7.5),
  ('listening', 30, 32, 7.0),
  ('listening', 27, 29, 6.5),
  ('listening', 23, 26, 6.0),
  ('listening', 20, 22, 5.5),
  ('listening', 16, 19, 5.0),
  ('listening', 13, 15, 4.5),
  ('listening', 10, 12, 4.0),
  ('listening',  7,  9, 3.5),
  ('listening',  5,  6, 3.0),
  ('listening',  3,  4, 2.5);

-- Self-assert: listening PHẢI khớp Reading Academic ở mọi raw 3..40 (không gap/overlap), và 4 điểm đã sửa.
do $$
declare r int; bl numeric; br numeric;
begin
  for r in 3..40 loop
    select band into bl from public.score_bands where test_type = 'listening'  and r between raw_min and raw_max;
    select band into br from public.score_bands where test_type = 'reading'    and r between raw_min and raw_max;
    if bl is null then raise exception 'FAIL listening correction: raw % không map', r; end if;
    if bl is distinct from br then raise exception 'FAIL listening correction: raw % listening=% reading=%', r, bl, br; end if;
  end loop;
  -- 4 điểm đã sửa (guard cứng chống hồi quy).
  if (select band from public.score_bands where test_type='listening' and 18 between raw_min and raw_max) <> 5.0 then raise exception 'FAIL: raw 18 != 5.0'; end if;
  if (select band from public.score_bands where test_type='listening' and 19 between raw_min and raw_max) <> 5.0 then raise exception 'FAIL: raw 19 != 5.0'; end if;
  if (select band from public.score_bands where test_type='listening' and 26 between raw_min and raw_max) <> 6.0 then raise exception 'FAIL: raw 26 != 6.0'; end if;
  if (select band from public.score_bands where test_type='listening' and 32 between raw_min and raw_max) <> 7.0 then raise exception 'FAIL: raw 32 != 7.0'; end if;
  raise notice 'PASS listening correction: 3..40 khớp Reading Academic; 18/19→5.0, 26→6.0, 32→7.0';
end $$;
