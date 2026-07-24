-- Tuỳ chỉnh hiển thị ẢNH BÌA bài Tips: kiểu vừa khung + chiều cao khung.
--   cover_fit  : 'cover'   = cắt lấp đầy khung (mặc định, như cũ)
--                'contain' = hiện đủ ảnh không cắt (hợp ảnh chụp bảng/biểu đồ) — letterbox nền nhạt
--   cover_height: chiều cao khung ảnh bìa (px) ở trang bài + xem trước; null → dùng mặc định app.
alter table public.tip_articles
  add column if not exists cover_fit text not null default 'cover';
alter table public.tip_articles
  add column if not exists cover_height integer;

alter table public.tip_articles
  drop constraint if exists tip_articles_cover_fit_chk;
alter table public.tip_articles
  add constraint tip_articles_cover_fit_chk check (cover_fit in ('cover', 'contain'));

alter table public.tip_articles
  drop constraint if exists tip_articles_cover_height_chk;
alter table public.tip_articles
  add constraint tip_articles_cover_height_chk check (cover_height is null or (cover_height between 100 and 800));
