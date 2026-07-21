-- ============================================================
-- TIPS-001 — Bảng bài viết Tips (blog "Tips & Chiến thuật").
-- Admin soạn (WYSIWYG body_html) → public đọc bài PUBLISHED. Trước đây /tips đọc mảng tĩnh
--   (lib/tips/articles.ts); giờ chuyển sang DB để có mục viết bài ở admin.
-- LUẬT THÉP: RLS chỉ cho anon/authenticated SELECT bài published; mọi ghi (admin) qua service_role
--   sau requireAdmin (giống products/tests). body_html vẫn sanitize allowlist ở server trước khi lưu & render.
-- Additive. Rollback: drop table public.tip_articles.
-- ============================================================

create table if not exists public.tip_articles (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  skill         text not null,
  type          text not null,
  title         text not null,
  excerpt       text not null default '',
  body_html     text not null default '',
  author        text not null default '',
  band          text not null default '',
  read_minutes  integer not null default 5,
  status        text not null default 'draft',
  sort_order    integer not null default 0,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint tip_articles_skill_chk  check (skill in ('reading','listening','writing','speaking')),
  constraint tip_articles_type_chk   check (type in ('strategy','qtype')),
  constraint tip_articles_status_chk check (status in ('draft','published')),
  constraint tip_articles_title_chk  check (title <> ''),
  constraint tip_articles_read_chk   check (read_minutes between 1 and 120)
);

create index if not exists tip_articles_list_idx
  on public.tip_articles (status, sort_order, published_at desc);

-- RLS: public đọc bài published; admin ghi qua service_role (bypass RLS).
alter table public.tip_articles enable row level security;
grant select on public.tip_articles to anon, authenticated;
grant all    on public.tip_articles to service_role;

drop policy if exists tip_articles_select_published on public.tip_articles;
create policy tip_articles_select_published on public.tip_articles
  for select to anon, authenticated using (status = 'published');

-- updated_at tự cập nhật khi UPDATE.
create or replace function public.tip_articles_touch() returns trigger
  language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists tip_articles_touch_trg on public.tip_articles;
create trigger tip_articles_touch_trg before update on public.tip_articles
  for each row execute function public.tip_articles_touch();

-- Seed 8 bài mẫu (từ thiết kế). body_html = câu dẫn (excerpt) + thân MẪU dùng chung —
--   Owner thay nội dung thật sau qua /admin/tips. published_at giữ thứ tự hiển thị.
insert into public.tip_articles (slug, skill, type, title, excerpt, author, band, read_minutes, status, sort_order, published_at, body_html)
select v.slug, v.skill, v.type, v.title, v.excerpt, v.author, v.band, v.read_minutes, 'published', v.ord, v.pub,
  '<p>' || v.excerpt || '</p>' ||
  $b$<p>Trước khi vào chi tiết, hãy nhớ nguyên tắc cốt lõi: giám khảo chấm theo tiêu chí, không chấm theo cảm tính. Vì vậy mọi chiến thuật dưới đây đều xoay quanh việc bám sát band descriptors và luyện tập có mục tiêu.</p><h2>Vì sao dạng này khiến nhiều bạn mất điểm</h2><p>Phần lớn lỗi sai không đến từ vốn từ mà đến từ cách đọc lướt sai chỗ, hiểu sai yêu cầu đề và quản lý thời gian kém. Khi bạn hệ thống lại quy trình, tỉ lệ đúng tăng rõ rệt chỉ sau vài buổi luyện.</p><h2>Quy trình từng bước</h2><ol><li>Đọc câu hỏi và xác định từ khoá không thể thay thế.</li><li>Quét (scan) đoạn văn để định vị vùng chứa thông tin.</li><li>Đọc kỹ (read closely) đúng vùng đó, đối chiếu nghĩa — không đối chiếu từ.</li><li>Quyết định dựa trên bằng chứng trong bài, không dựa vào kiến thức nền.</li></ol><p>Luyện đúng quy trình này trên các bộ đề thi thật, mỗi ngày một phần, band của bạn sẽ ổn định hơn hẳn chỉ sau 2 tuần.</p>$b$
from (values
  ('tfng',   'reading',   'strategy', '7 bước xử lý dạng True/False/Not Given không bao giờ sai', 'Nhận diện bẫy “Not Given” trong 20 giây với quy trình 7 bước kèm ví dụ đề Cambridge.', 'Minh Trang', 'IELTS 8.5', 8, 1, timestamptz '2026-07-18 09:00+07'),
  ('map',    'listening', 'qtype',    'Nghe map/plan labelling: đừng bao giờ rời mắt khỏi bản đồ', 'Chiến thuật theo dõi hướng di chuyển và từ chỉ vị trí để không lạc câu.', 'Đức Anh', 'IELTS 8.0', 6, 2, timestamptz '2026-07-15 09:00+07'),
  ('task2',  'writing',   'strategy', 'Dàn ý Writing Task 2 trong 5 phút cho mọi đề', 'Khung 4 đoạn linh hoạt áp dụng cho opinion, discussion và problem–solution.', 'Hải Yến', 'IELTS 8.0', 9, 3, timestamptz '2026-07-12 09:00+07'),
  ('part2',  'speaking',  'strategy', 'Speaking Part 2: kể chuyện tự nhiên với công thức PEEL', 'Biến cue card thành câu chuyện mạch lạc, đủ ý mà không học thuộc lòng.', 'Quốc Bảo', 'IELTS 8.5', 7, 4, timestamptz '2026-07-10 09:00+07'),
  ('match',  'reading',   'qtype',    'Matching Headings: chọn tiêu đề đúng bằng câu chủ đề', 'Tại sao đọc câu đầu và câu cuối đoạn lại chưa đủ — và nên đọc gì thay thế.', 'Minh Trang', 'IELTS 8.5', 6, 5, timestamptz '2026-07-08 09:00+07'),
  ('mcq',    'listening', 'strategy', 'Nghe multiple choice: xử lý câu gây nhiễu (distractor)', 'Vì sao đáp án nghe được đầu tiên thường sai, và cách chờ tín hiệu chốt.', 'Đức Anh', 'IELTS 8.0', 5, 6, timestamptz '2026-07-05 09:00+07'),
  ('task1',  'writing',   'qtype',    'Writing Task 1: mô tả biểu đồ đường không lặp từ', 'Bộ từ vựng xu hướng và cấu trúc so sánh giúp câu văn đa dạng, tự nhiên.', 'Hải Yến', 'IELTS 8.0', 8, 7, timestamptz '2026-07-02 09:00+07'),
  ('fluency','speaking',  'strategy', 'Tăng độ trôi chảy khi bí ý: cụm từ câu giờ tự nhiên', 'Những filler được giám khảo chấp nhận, giúp bạn có thời gian suy nghĩ.', 'Quốc Bảo', 'IELTS 8.5', 5, 8, timestamptz '2026-06-29 09:00+07')
) as v(slug, skill, type, title, excerpt, author, band, read_minutes, ord, pub)
on conflict (slug) do nothing;
