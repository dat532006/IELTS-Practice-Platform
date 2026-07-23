import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { sanitizeTipHtml } from '@/lib/sanitize/tip-html'
import { toTipArticle, type TipArticle, type TipRow } from '@/lib/tips/articles'

// Cột public (KHÔNG body) cho danh sách/lưới.
const LIST_COLS = 'slug, skill, type, title, excerpt, author, band, featured, cover_image, read_minutes, published_at, created_at'

// Danh sách bài Tips đã published. RLS (anon/authenticated) đã giới hạn published; vẫn lọc tường minh.
// Xếp featured (nổi bật) LÊN ĐẦU → trang /tips lấy articles[0] làm hero, phần còn lại vào lưới.
export async function listPublishedTips(): Promise<TipArticle[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tip_articles')
    .select(LIST_COLS)
    .eq('status', 'published')
    .order('featured', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('published_at', { ascending: false, nullsFirst: false })
  if (error || !data) return [] // bảng chưa migrate / lỗi tạm → trang vẫn render (rỗng), không 500
  return (data as TipRow[]).map(toTipArticle)
}

// 1 bài đã published theo slug (kèm body_html đã sanitize). Không có → null.
export async function getPublishedTip(
  slug: string,
): Promise<{ article: TipArticle; bodyHtml: string } | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tip_articles')
    .select(`${LIST_COLS}, body_html`)
    .eq('status', 'published')
    .eq('slug', slug)
    .maybeSingle()
  if (error || !data) return null
  const row = data as TipRow
  return { article: toTipArticle(row), bodyHtml: sanitizeTipHtml(row.body_html) }
}

// Bài liên quan (cùng kỹ năng, khác bài hiện tại).
export async function relatedPublishedTips(article: TipArticle, limit = 2): Promise<TipArticle[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tip_articles')
    .select(LIST_COLS)
    .eq('status', 'published')
    .eq('skill', article.skill)
    .neq('slug', article.slug)
    .order('sort_order', { ascending: true })
    .limit(limit)
  if (error || !data) return []
  return (data as TipRow[]).map(toTipArticle)
}
