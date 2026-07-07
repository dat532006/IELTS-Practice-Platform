-- ============================================================
-- Admin grant (M11) — thêm giá trị 'admin' vào unlock_via_t.
-- Để product_unlocks.via phân biệt nguồn: 'purchase' (mua bằng xu) · 'redeem' (mã kích hoạt) · 'admin' (owner cấp trực tiếp).
-- ⚠️ TÁCH RIÊNG migration: ADD VALUE phải commit TRƯỚC khi RPC ở migration sau tham chiếu 'admin'
--    (check_function_bodies=on validate enum literal lúc CREATE FUNCTION). Idempotent qua IF NOT EXISTS.
-- Rollback: enum không xoá được value; để nguyên (an toàn, additive).
-- ============================================================
alter type public.unlock_via_t add value if not exists 'admin';
