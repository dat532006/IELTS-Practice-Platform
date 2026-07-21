import { createAdminClient } from '@/lib/supabase/admin'
import { AdminTipsList, type AdminTipRow } from '@/components/admin/AdminTipsList'

// Danh sách bài Tips (gồm cả nháp). Layout đã server-gate requireAdmin; đọc qua service_role.
export const dynamic = 'force-dynamic'

export default async function AdminTipsPage() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('tip_articles')
    .select('id, slug, skill, type, title, status, sort_order')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  return <AdminTipsList rows={(data ?? []) as AdminTipRow[]} />
}
