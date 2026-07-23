-- Tips "Bài nổi bật": cột featured thay vì mượn sort_order.
-- Trang /tips xếp featured lên đầu (hero) và ẩn khỏi lưới. App tự giữ CHỈ 1 bài featured
-- tại một thời điểm (API /api/admin/tips bỏ featured ở các bài khác khi set true) — cột chỉ
-- là boolean phẳng, không ràng buộc unique cứng để tránh kẹt khi đổi bài nổi bật.
alter table public.tip_articles
  add column if not exists featured boolean not null default false;

-- Index bộ lọc từng phần: truy vấn danh sách order featured desc + lấy bài nổi bật rất nhanh.
create index if not exists tip_articles_featured_idx
  on public.tip_articles (featured)
  where featured;

-- Ảnh bìa/minh hoạ bài viết: URL ảnh công khai (bucket media). Rỗng/null → UI lùi về gradient theo kỹ năng.
-- API validate URL qua isAllowedPublicMediaUrl (origin storage public) trước khi lưu — chống URL lạ/độc hại.
alter table public.tip_articles
  add column if not exists cover_image text;
