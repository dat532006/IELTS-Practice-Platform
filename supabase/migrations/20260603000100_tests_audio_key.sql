-- ============================================================
-- W7 Backend — tests.audio_key (Listening audio object key, SERVER-ONLY)
-- Contract: docs/ContractForAI/BackendEngineer/phase2/W7/w7_listening_audio_contract.md §2
--
-- audio_key = raw Cloudflare R2 object key cho Listening audio. Là PREMIUM metadata
--   server-only: chỉ server (service_role) đọc để SINH signed URL sau access guard.
-- 🔐 KHÔNG column-grant cho anon/authenticated: `tests` dùng column-grant (migration 000400),
--   cột KHÔNG nằm trong grant ⇒ client SELECT cột này = insufficient_privilege (deny tự động).
--   (Giống passages/questions: không grant → không lộ.)
-- KHÔNG ảnh hưởng metadata khác: các cột đã grant (id/slug/title/type/... /duration_sec) giữ nguyên.
--
-- Rollback: alter table public.tests drop column if exists audio_key;
-- ============================================================

alter table public.tests add column if not exists audio_key text;

comment on column public.tests.audio_key is
  'R2 object key cho Listening audio — SERVER-ONLY, KHÔNG grant client; chỉ dùng sinh signed URL sau access guard (W7).';
