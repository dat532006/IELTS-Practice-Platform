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
  const { data, error } = await admin.from(table).select(column).not(column, 'is', null)
  // STORE-004: abort before deletion if the DB reference query fails.
  // A failed query must never be interpreted as an empty reference set.
  if (error) throw new Error(`reference_query_failed:${table}.${column}`)
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    const obj = parsePublicObjectPath(row[column] as string)
    if (obj && obj.bucket === bucket) set.add(obj.path)
  }
  return set
}

// AI-010 — ảnh đề Writing (passage.image) nằm TRONG tests.passages jsonb, KHÔNG có cột riêng →
//   phải gom vào referenced-set của bucket media, nếu không sweep sẽ XOÁ ảnh đề ĐANG DÙNG sau grace.
//   Lỗi query → throw (STORE-004: query fail không bao giờ được hiểu là "không có tham chiếu").
async function collectPassageImageRefs(admin: StorageAdmin, bucket: string): Promise<Set<string>> {
  const set = new Set<string>()
  const { data, error } = await admin.from('tests').select('passages').not('passages', 'is', null)
  if (error) throw new Error('passages_reference_query_failed')
  for (const row of (data ?? []) as { passages: unknown }[]) {
    if (!Array.isArray(row.passages)) continue
    for (const p of row.passages as { image?: unknown }[]) {
      const obj = parsePublicObjectPath(p?.image as string)
      if (obj && obj.bucket === bucket) set.add(obj.path)
    }
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
      if (error) throw new Error(`storage_list_failed:${bucket}`)
      if (!data || data.length === 0) break
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
  extraRefs?: Set<string>, // AI-010: tham chiếu bổ sung (vd ảnh đề trong tests.passages)
): Promise<{ scanned: number; orphans: number; deleted: number }> {
  const referenced = await collectReferenced(admin, table, column, bucket)
  if (extraRefs) for (const p of extraRefs) referenced.add(p)
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
    const mediaBucket = process.env.SUPABASE_STORAGE_BUCKET || 'media'
    // AI-010: ảnh đề Writing (passage.image) cũng là "đang dùng" — thiếu dòng này là cron xoá ảnh thật.
    const passageImageRefs = await collectPassageImageRefs(admin, mediaBucket)
    const media = await sweepBucket(admin, mediaBucket, 'tests', 'cover_image', graceDays, enabled, now, passageImageRefs)
    const avatars = await sweepBucket(admin, 'avatars', 'profiles', 'avatar', graceDays, enabled, now)
    const detail = { dry_run: !enabled, grace_days: graceDays, media, avatars }
    await recordRun(admin, true, detail)
    return ok(detail)
  } catch {
    await recordRun(admin, false, { kind: 'sweep_error' })
    return fail('INTERNAL', 'Không quét được orphan', { status: 500 })
  }
}
