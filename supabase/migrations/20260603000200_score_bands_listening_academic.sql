-- ============================================================
-- W7 — Listening band conversion table (IELTS Academic Listening), reference data.
-- Contract: docs/ContractForAI/BackendEngineer/phase2/W7/w7_listening_audio_contract.md §2b
--
-- Mirror pattern reading W6 (migration 20260602000300): đặt bảng chuẩn ở MIGRATION
--   + delete-insert SCOPED theo test_type='listening' → HỘI TỤ idempotent về đúng bảng,
--   cập nhật được cả DB đã seed 3 dòng listening mẫu cũ (seed.sql W6). KHÔNG đụng reading.
--
-- Bảng Academic Listening (raw out of 40), phủ liên tục 3..40 (không gap/overlap), 14 dòng:
--   raw 0..2 cố ý KHÔNG map (defensive, giống reading) → convertToBand trả band=null +
--   warning BAND_UNMAPPED (không ghi band sai). Bản chính thức đầy đủ do admin/M11 seed.
-- ============================================================

delete from public.score_bands where test_type = 'listening';

insert into public.score_bands (test_type, raw_min, raw_max, band) values
  ('listening', 39, 40, 9.0),
  ('listening', 37, 38, 8.5),
  ('listening', 35, 36, 8.0),
  ('listening', 32, 34, 7.5),
  ('listening', 30, 31, 7.0),
  ('listening', 26, 29, 6.5),
  ('listening', 23, 25, 6.0),
  ('listening', 18, 22, 5.5),
  ('listening', 16, 17, 5.0),
  ('listening', 13, 15, 4.5),
  ('listening', 10, 12, 4.0),
  ('listening',  7,  9, 3.5),
  ('listening',  5,  6, 3.0),
  ('listening',  3,  4, 2.5);
