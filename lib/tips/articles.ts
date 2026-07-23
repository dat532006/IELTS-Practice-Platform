// Tips blog — kiểu dữ liệu + meta trình bày + mapper từ hàng DB sang view model.
// Bài viết lưu ở bảng public.tip_articles (migration 20260722000100); truy vấn ở lib/tips/queries.ts.

export type TipSkill = 'reading' | 'listening' | 'writing' | 'speaking'
export type TipType = 'strategy' | 'qtype'

// View model dùng cho UI (đã suy ra initials/date/read để component chỉ hiển thị).
export type TipArticle = {
  slug: string
  skill: TipSkill
  type: TipType
  title: string
  excerpt: string
  author: string
  band: string
  featured: boolean
  initials: string
  date: string // ví dụ "18 Th7, 2026"
  read: string // ví dụ "8 phút đọc"
}

// Hàng thô từ DB (admin đọc cả draft).
export type TipRow = {
  id?: string
  slug: string
  skill: string
  type: string
  title: string
  excerpt: string | null
  body_html?: string | null
  author: string | null
  band: string | null
  read_minutes: number | null
  status?: string
  sort_order?: number
  featured?: boolean | null
  published_at: string | null
  created_at?: string | null
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

// Slug từ tiêu đề: bỏ dấu tiếng Việt, thường hoá, chỉ giữ a-z0-9 và gạch ngang.
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // bỏ dấu thanh/dấu phụ
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function initialsOf(author: string): string {
  const parts = author.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '•'
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : ''
  return (first + last).toUpperCase()
}

// "18 Th7, 2026" (định dạng Việt gọn) từ ISO date. Không có ngày → chuỗi rỗng.
function formatTipDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getDate()} Th${d.getMonth() + 1}, ${d.getFullYear()}`
}

export function toTipArticle(row: TipRow): TipArticle {
  const author = row.author?.trim() || 'IELTS Practice'
  return {
    slug: row.slug,
    skill: row.skill as TipSkill,
    type: row.type as TipType,
    title: row.title,
    excerpt: row.excerpt ?? '',
    author,
    band: row.band?.trim() || '',
    featured: row.featured ?? false,
    initials: initialsOf(author),
    date: formatTipDate(row.published_at ?? row.created_at ?? null),
    read: `${row.read_minutes ?? 5} phút đọc`,
  }
}
