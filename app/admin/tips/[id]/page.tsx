import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminTipForm, type TipFormInitial } from '@/components/admin/AdminTipForm'

// Sửa bài Tips. Layout đã server-gate requireAdmin; đọc qua service_role (gồm cả nháp).
export const dynamic = 'force-dynamic'

export default async function AdminEditTipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient()
  const { data } = await admin
    .from('tip_articles')
    .select('id, slug, skill, type, title, excerpt, body_html, author, band, read_minutes, status, sort_order, featured, cover_image, cover_fit, cover_height')
    .eq('id', id)
    .maybeSingle()

  if (!data) notFound()
  const row = data as Record<string, unknown>

  const initial: TipFormInitial = {
    id: row.id as string,
    slug: row.slug as string,
    skill: row.skill as TipFormInitial['skill'],
    type: row.type as TipFormInitial['type'],
    title: row.title as string,
    excerpt: (row.excerpt as string | null) ?? '',
    body_html: (row.body_html as string | null) ?? '',
    author: (row.author as string | null) ?? '',
    band: (row.band as string | null) ?? '',
    read_minutes: (row.read_minutes as number | null) ?? 5,
    status: row.status as 'draft' | 'published',
    sort_order: (row.sort_order as number | null) ?? 0,
    featured: (row.featured as boolean | null) ?? false,
    cover_image: (row.cover_image as string | null) ?? '',
    cover_fit: (row.cover_fit as 'cover' | 'contain' | null) ?? 'cover',
    cover_height: (row.cover_height as number | null) ?? 280,
  }

  return <AdminTipForm initial={initial} />
}
