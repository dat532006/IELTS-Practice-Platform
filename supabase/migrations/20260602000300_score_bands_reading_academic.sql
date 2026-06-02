-- ============================================================
-- W6 — Reading band conversion table (IELTS Academic), reference data.
-- FIX (Leader review P1): trước đây seed `where not exists (toàn bảng)` → KHÔNG cập nhật được
--   DB đã có score_bands cũ/incomplete. Đặt bảng chuẩn ở MIGRATION (chạy mọi lần migrate/reset)
--   + delete-insert SCOPED theo test_type='reading' → HỘI TỤ idempotent về đúng bảng Academic.
--   KHÔNG đụng test_type khác (listening = W7).
--
-- Bảng Academic Reading (raw out of 40), phủ liên tục 3..40 (không gap/overlap):
--   raw 0..2 cố ý KHÔNG map ở W6 (dưới bảng tham chiếu) → convertToBand trả band=null + warning
--   BAND_UNMAPPED (không ghi band sai). Bản chính thức đầy đủ do admin/M11 seed trước launch.
-- ============================================================

delete from public.score_bands where test_type = 'reading';

insert into public.score_bands (test_type, raw_min, raw_max, band) values
  ('reading', 39, 40, 9.0),
  ('reading', 37, 38, 8.5),
  ('reading', 35, 36, 8.0),
  ('reading', 33, 34, 7.5),
  ('reading', 30, 32, 7.0),
  ('reading', 27, 29, 6.5),
  ('reading', 23, 26, 6.0),
  ('reading', 20, 22, 5.5),
  ('reading', 16, 19, 5.0),
  ('reading', 13, 15, 4.5),
  ('reading', 10, 12, 4.0),
  ('reading',  7,  9, 3.5),
  ('reading',  5,  6, 3.0),
  ('reading',  3,  4, 2.5);
