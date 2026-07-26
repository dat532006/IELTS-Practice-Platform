-- Tuỳ chỉnh hiển thị ẢNH MINH HỌA BỘ ĐỀ (/products/[slug] — khung cover tỉ lệ 16/7).
-- Cùng vấn đề với ảnh bìa đề (migration 20260726000100): khung dùng object-cover nên cắt GIỮA
--   cứng, ảnh có chủ thể lệch bị mất phần quan trọng và Owner không chỉnh được.
--   thumb_pos_x / thumb_pos_y : object-position theo %, 50/50 = canh giữa (mặc định = hành vi cũ)
--   thumb_zoom               : % phóng to, 100 = vừa khung (mặc định = hành vi cũ)
-- Mặc định 50/50/100 nên bộ đề đang có ảnh KHÔNG đổi hiển thị sau migration.
-- KHÔNG đụng matview product_search: thẻ nhỏ ngoài danh sách vẫn canh giữa như cũ (ảnh bé,
--   cắt giữa không thành vấn đề) — tránh phải dựng lại một object bypass RLS chỉ vì lý do trang trí.
alter table public.products add column if not exists thumb_pos_x smallint not null default 50;
alter table public.products add column if not exists thumb_pos_y smallint not null default 50;
alter table public.products add column if not exists thumb_zoom smallint not null default 100;

alter table public.products drop constraint if exists products_thumb_pos_x_chk;
alter table public.products add constraint products_thumb_pos_x_chk check (thumb_pos_x between 0 and 100);

alter table public.products drop constraint if exists products_thumb_pos_y_chk;
alter table public.products add constraint products_thumb_pos_y_chk check (thumb_pos_y between 0 and 100);

alter table public.products drop constraint if exists products_thumb_zoom_chk;
alter table public.products add constraint products_thumb_zoom_chk check (thumb_zoom between 100 and 300);
