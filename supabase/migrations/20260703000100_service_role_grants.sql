-- ============================================================
-- Ensure service_role (server-only privileged role) has FULL access to public objects.
--
-- Bối cảnh: các migration khác CỐ Ý không grant cho service_role (xem 000400) vì tin
-- rằng Supabase đã provision sẵn full quyền cho service_role qua default-privileges.
-- Điều đó ĐÚNG khi project bật "Automatically expose new tables". Nếu tick đó bị TẮT
-- lúc tạo project, các bảng do migration tạo KHÔNG được auto-grant cho service_role →
-- admin client (server) nhận 42501 permission denied trên MỌI bảng.
--
-- Migration này grant tường minh để tập migration TỰ ĐỦ, không phụ thuộc cấu hình
-- dashboard. Idempotent. An toàn trong db:verify: shim (_supabase_shim.local.sql) đã
-- cấp service_role qua default-privileges nên đây chỉ là tái khẳng định.
--
-- Lưu ý bảo mật: service_role là role server-only (BYPASSRLS) — theo thiết kế nó PHẢI
-- có toàn quyền (đọc answer_keys để chấm, ghi ledger/unlock…). RLS + column-grant chỉ
-- bảo vệ client roles (anon/authenticated), KHÔNG áp cho service_role.
-- ============================================================

grant usage on schema public to service_role;

-- Bảng đã tồn tại (fix prod hiện tại)
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

-- Bảng tạo bởi migration về sau (mimic Supabase provisioning)
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;
