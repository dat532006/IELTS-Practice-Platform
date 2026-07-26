-- Tuỳ chỉnh hiển thị ẢNH BÌA đề (/tests/[id] — khung cover cao 174px).
-- Vấn đề: khung dùng object-cover nên ảnh luôn bị cắt GIỮA cứng; ảnh có chủ thể lệch trên/dưới
--   (vd ảnh hươu cao cổ + bản đồ châu Phi) bị cắt mất phần quan trọng, Owner không chỉnh được.
-- 3 số dưới đây cho Owner kéo & phóng trong admin mà KHÔNG đụng file ảnh gốc → chỉnh lại lúc nào
--   cũng được, không nén lại, không mất chất lượng.
--   cover_pos_x / cover_pos_y : object-position theo %, 50/50 = canh giữa (mặc định = hành vi cũ)
--   cover_zoom               : % phóng to, 100 = vừa khung (mặc định = hành vi cũ)
-- Mặc định giữ nguyên 50/50/100 nên mọi đề đang có ảnh KHÔNG đổi hiển thị sau migration.
alter table public.tests add column if not exists cover_pos_x smallint not null default 50;
alter table public.tests add column if not exists cover_pos_y smallint not null default 50;
alter table public.tests add column if not exists cover_zoom smallint not null default 100;

alter table public.tests drop constraint if exists tests_cover_pos_x_chk;
alter table public.tests add constraint tests_cover_pos_x_chk check (cover_pos_x between 0 and 100);

alter table public.tests drop constraint if exists tests_cover_pos_y_chk;
alter table public.tests add constraint tests_cover_pos_y_chk check (cover_pos_y between 0 and 100);

-- Trần 300%: quá mức này ảnh vỡ hạt trên khung 174px, chặn luôn ở DB cho chắc.
alter table public.tests drop constraint if exists tests_cover_zoom_chk;
alter table public.tests add constraint tests_cover_zoom_chk check (cover_zoom between 100 and 300);
