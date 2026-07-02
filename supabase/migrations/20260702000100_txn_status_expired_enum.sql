-- ============================================================
-- PostW19 Backend — Review fix B-03 (bước 1/2): thêm giá trị enum 'expired' cho txn_status_t.
-- Vì sao tách file: giá trị enum mới KHÔNG dùng được trong cùng transaction với ALTER TYPE
--   (PG error 55P04 "unsafe use of new value") — mọi usage nằm ở 20260702000200.
-- Ngữ nghĩa: 'expired' = topup pending quá hạn do reconcile dọn (backend-internal).
--   'failed'  = dành riêng cho provider báo thất bại (adapter cổng thật A1 sau này) — KHÔNG credit lại được.
-- Rollback: enum value không drop được trực tiếp; rollback = revert 20260702000200 (failed lại là trạng thái reconcile).
-- ============================================================
alter type public.txn_status_t add value if not exists 'expired';
