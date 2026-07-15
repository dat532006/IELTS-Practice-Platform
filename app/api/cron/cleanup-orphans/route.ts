import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { parsePublicObjectPath } from '@/lib/storage/media-url'
import { isOrphanObject, orphanGraceDays, orphanCleanupEnabled } from '@/lib/storage/orphan'
import { logEvent } from '@/lib/obs/log-event'
import { ok, fail } from '@/lib/api/response'

// GET /api/cron/cleanup-orphans — STORE-001 safety-net (Owner chốt: compensated-delete + orphan job có grace).
// Compensated-delete (setTestMeta cover, ProfilePanel avatar) đã xoá object cũ ngay khi thay. Job này quét
//   object KHÔNG được DB tham chiếu + CŨ hơn grace (chống race upload↔ghi ref) → dọn nốt trường hợp lỗi.
// AN TOÀN: mặc định DRY-RUN (chỉ đếm/log, KHÔNG xoá) — Owner bật STORAGE_ORPHAN_CLEANUP_ENABLED=true sau khi
//   verify reference-check đúng trên staging (chống xoá nhầm object đang dùng). grace = STORAGE_ORPHAN_GRACE_DAYS.
// LUẬT THÉP: CRON_SECRET chưa set → 503 (fail closed); auth bearer timing-safe.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LIST_PAGE = 100
const MAX_OBJECTS = 5000 // chặn trên mỗi bucket/run (bounded)

type StorageAdmin = ReturnType<typeof createAdminClient>

async function recordRun(admin: StorageAdmin, ok: boolean, detail: Record<string, unknown>) {
  try { await admin.from('cron_runs').insert({ job: 'cleanup-orphans', ok, detail }) } catch { /* audit best-effort */ }
}

function bearerMatches(header: string | null, secret: string): boolean {
  if (!header) return false
  const token = header.startsWith('Bearer ') ? header.slice(7) : header
  const a = Buffer.from(token)
  const b = Buffer.from(secret)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// Tập path đang được DB tham chiếu (chỉ path thuộc bucket đang xét) — object trong tập này KHÔNG BAO GIỜ xoá.
async function collectReferenced(admin: StorageAdmin, table: string, column: string, bucket: string): Promise<Set<string>> {
  const set = new Set<string>()
  const { data } = await admin.from(table).select(column).not(column, 'is', null)
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    const obj = parsePublicObjectPath(row[column] as string)
    if (obj && obj.bucket === bucket) set.add(obj.path)
  }
  return set
}

// Liệt kê object trong bucket (đệ quy folder, có cap). Trả {path, created_at}.
async function listAllObjects(admin: StorageAdmin, bucket: string): Promise<{ path: string; created_at: string | null }[]> {
  const out: { path: string; created_at: string | null }[] = []
  const queue: string[] = ['']
  while (queue.length && out.length < MAX_OBJECTS) {
    const prefix = queue.shift() as string
    let offset = 0
    for (;;) {
      const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: LIST_PAGE, offset, sortBy: { column: 'name', order: 'asc' } })
      if (error || !data || data.length === 0) break
      for (const e of data) {
        const full = prefix ? `${prefix}/${e.name}` : e.name
        if (e.id === null) queue.push(full) // folder → đệ quy
        else { out.push({ path: full, created_at: e.created_at ?? null }); if (out.length >= MAX_OBJECTS) break }
      }
      if (data.length < LIST_PAGE) break
      offset += data.length
    }
  }
  return out
}

async function sweepBucket(
  admin: StorageAdmin,
  bucket: string,
  table: string,
  column: string,
  graceDays: number,
  enabled: boolean,
  now: number,
): Promise<{ scanned: number; orphans: number; deleted: number }> {
  const referenced = await collectReferenced(admin, table, column, bucket)
  const objects = await listAllObjects(admin, bucket)
  const orphanPaths = objects
    .filter((o) => o.created_at && isOrphanObject(o.created_at, o.path, referenced, graceDays, now))
    .map((o) => o.path)
  let deleted = 0
  if (enabled && orphanPaths.length > 0) {
    // Xoá theo lô 100 (Supabase remove nhận mảng path).
    for (let i = 0; i < orphanPaths.length; i += 100) {
      const batch = orphanPaths.slice(i, i + 100)
      const { error } = await admin.storage.from(bucket).remove(batch)
      if (error) logEvent('storage.orphan_sweep_error', 'warn', { bucket })
      else deleted += batch.length
    }
  }
  return { scanned: objects.length, orphans: orphanPaths.length, deleted }
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return fail('INTERNAL', 'CRON_SECRET chưa cấu hình', { status: 503 })
  if (!bearerMatches(request.headers.get('authorization'), secret)) {
    return fail('UNAUTHORIZED', 'Cron token không hợp lệ', { status: 401 })
  }

  const admin = createAdminClient()
  const graceDays = orphanGraceDays()
  const enabled = orphanCleanupEnabled() // false = DRY-RUN (chỉ quan sát, KHÔNG xoá)
  const now = Date.now()
  try {
    const media = await sweepBucket(admin, process.env.SUPABASE_STORAGE_BUCKET || 'media', 'tests', 'cover_image', graceDays, enabled, now)
    const avatars = await sweepBucket(admin, 'avatars', 'profiles', 'avatar', graceDays, enabled, now)
    const detail = { dry_run: !enabled, grace_days: graceDays, media, avatars }
    await recordRun(admin, true, detail)
    return ok(detail)
  } catch {
    await recordRun(admin, false, { kind: 'sweep_error' })
    return fail('INTERNAL', 'Không quét được orphan', { status: 500 })
  }
}
