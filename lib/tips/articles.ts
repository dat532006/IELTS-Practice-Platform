// Tips blog — dữ liệu tĩnh (8 bài mẫu từ thiết kế "Tips.dc.html"). NỘI DUNG THÂN BÀI là placeholder,
// Owner thay bằng bài thật sau (giống pipeline nạp đề). Slug = id, dùng cho route /tips/[slug].

export type TipSkill = 'reading' | 'listening' | 'writing' | 'speaking'
export type TipType = 'strategy' | 'qtype'

export type TipArticle = {
  slug: string
  skill: TipSkill
  type: TipType
  title: string
  excerpt: string
  author: string
  band: string
  initials: string
  date: string
  read: string
}

export const TIP_TYPE_LABEL: Record<TipType, string> = {
  strategy: 'Chiến thuật',
  qtype: 'Dạng bài',
}

// color = accent tươi (cover/chấm trang trí); text = biến thể ĐẠT WCAG AA cho chữ nhỏ trên nền trắng.
export const TIP_SKILL: Record<
  TipSkill,
  { label: string; color: string; text: string; cover: string }
> = {
  reading: { label: 'Reading', color: '#F2724E', text: '#B14724', cover: 'linear-gradient(140deg,#FFB492,#F2724E)' },
  listening: { label: 'Listening', color: '#ECA22B', text: '#8A5D0A', cover: 'linear-gradient(140deg,#F7CD80,#ECA22B)' },
  writing: { label: 'Writing', color: '#7C5CE6', text: '#6A48D6', cover: 'linear-gradient(140deg,#A48CF0,#6A48D6)' },
  speaking: { label: 'Speaking', color: '#EE5C92', text: '#C13067', cover: 'linear-gradient(140deg,#F79BBB,#EE5C92)' },
}

export const TIP_ARTICLES: TipArticle[] = [
  { slug: 'tfng', skill: 'reading', type: 'strategy', title: '7 bước xử lý dạng True/False/Not Given không bao giờ sai', excerpt: 'Nhận diện bẫy “Not Given” trong 20 giây với quy trình 7 bước kèm ví dụ đề Cambridge.', author: 'Minh Trang', band: 'IELTS 8.5', initials: 'MT', date: '18 Th7, 2026', read: '8 phút đọc' },
  { slug: 'map', skill: 'listening', type: 'qtype', title: 'Nghe map/plan labelling: đừng bao giờ rời mắt khỏi bản đồ', excerpt: 'Chiến thuật theo dõi hướng di chuyển và từ chỉ vị trí để không lạc câu.', author: 'Đức Anh', band: 'IELTS 8.0', initials: 'ĐA', date: '15 Th7, 2026', read: '6 phút đọc' },
  { slug: 'task2', skill: 'writing', type: 'strategy', title: 'Dàn ý Writing Task 2 trong 5 phút cho mọi đề', excerpt: 'Khung 4 đoạn linh hoạt áp dụng cho opinion, discussion và problem–solution.', author: 'Hải Yến', band: 'IELTS 8.0', initials: 'HY', date: '12 Th7, 2026', read: '9 phút đọc' },
  { slug: 'part2', skill: 'speaking', type: 'strategy', title: 'Speaking Part 2: kể chuyện tự nhiên với công thức PEEL', excerpt: 'Biến cue card thành câu chuyện mạch lạc, đủ ý mà không học thuộc lòng.', author: 'Quốc Bảo', band: 'IELTS 8.5', initials: 'QB', date: '10 Th7, 2026', read: '7 phút đọc' },
  { slug: 'match', skill: 'reading', type: 'qtype', title: 'Matching Headings: chọn tiêu đề đúng bằng câu chủ đề', excerpt: 'Tại sao đọc câu đầu và câu cuối đoạn lại chưa đủ — và nên đọc gì thay thế.', author: 'Minh Trang', band: 'IELTS 8.5', initials: 'MT', date: '8 Th7, 2026', read: '6 phút đọc' },
  { slug: 'mcq', skill: 'listening', type: 'strategy', title: 'Nghe multiple choice: xử lý câu gây nhiễu (distractor)', excerpt: 'Vì sao đáp án nghe được đầu tiên thường sai, và cách chờ tín hiệu chốt.', author: 'Đức Anh', band: 'IELTS 8.0', initials: 'ĐA', date: '5 Th7, 2026', read: '5 phút đọc' },
  { slug: 'task1', skill: 'writing', type: 'qtype', title: 'Writing Task 1: mô tả biểu đồ đường không lặp từ', excerpt: 'Bộ từ vựng xu hướng và cấu trúc so sánh giúp câu văn đa dạng, tự nhiên.', author: 'Hải Yến', band: 'IELTS 8.0', initials: 'HY', date: '2 Th7, 2026', read: '8 phút đọc' },
  { slug: 'fluency', skill: 'speaking', type: 'strategy', title: 'Tăng độ trôi chảy khi bí ý: cụm từ câu giờ tự nhiên', excerpt: 'Những filler được giám khảo chấp nhận, giúp bạn có thời gian suy nghĩ.', author: 'Quốc Bảo', band: 'IELTS 8.5', initials: 'QB', date: '29 Th6, 2026', read: '5 phút đọc' },
]

export function getTip(slug: string): TipArticle | undefined {
  return TIP_ARTICLES.find((a) => a.slug === slug)
}

export function relatedTips(article: TipArticle, limit = 2): TipArticle[] {
  return TIP_ARTICLES.filter((a) => a.skill === article.skill && a.slug !== article.slug).slice(0, limit)
}
