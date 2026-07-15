import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { refreshProductSearch } from '@/lib/admin/product-search'
import { ok, fail } from '@/lib/api/response'

// GET /api/cron/refresh-catalog — ADMIN-007 (Owner chốt: Eventual + observable, KHÔNG outbox).
// Safety-net: refresh matview product_search định kỳ để HEAL stale kể cả khi refresh sau mutation thất bại
//   và không có mutation kế (product_search là snapshot đầy đủ → refresh idempotent, rebuild toàn bộ).
// LUẬT THÉP (giống reconcile-topups): CRON_SECRET chưa set → 503 (fail closed); auth bearer timing-safe;
//   endpoint privileged KHÔNG mở khi thiếu secret. Mỗi lần chạy ghi cron_runs (best-effort) → quan sát được.
//   Observability lỗi refresh nằm ở refreshProductSearch (OBS_EVENT catalog.refresh_error).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Ghi audit run (best-effort). Audit lỗi KHÔNG được làm hỏng job → nuốt lỗi tại đây.
async function recordRun(admin: ReturnType<typeof createAdminClient>, ok: boolean, detail: Record<string, unknown>) {
  try { await admin.from('cron_runs').insert({ job: 'refresh-catalog', ok, detail }) } catch { /* audit best-effort */ }
}

function bearerMatches(header: string | null, secret: string): boolean {
  if (!header) return false
  const prefix = 'Bearer '
  const token = header.startsWith(prefix) ? header.slice(prefix.length) : header
  const a = Buffer.from(token)
  const b = Buffer.from(secret)
  if (a.length !== b.length) return false // timingSafeEqual yêu cầu cùng độ dài
  return timingSafeEqual(a, b)
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    // Không cấu hình secret → không cho chạy job privileged (fail closed).
    return fail('INTERNAL', 'CRON_SECRET chưa cấu hình', { status: 503 })
  }
  if (!bearerMatches(request.headers.get('authorization'), secret)) {
    return fail('UNAUTHORIZED', 'Cron token không hợp lệ', { status: 401 })
  }

  const admin = createAdminClient()
  const res = await refreshProductSearch(admin) // lỗi đã OBS_EVENT bên trong; KHÔNG log message thô ở đây
  if (!res.ok) {
    await recordRun(admin, false, { kind: 'refresh_failed' })
    return fail('INTERNAL', 'Không refresh được catalog', { status: 500 })
  }
  await recordRun(admin, true, {})
  return ok({ refreshed: true })
}
