import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { parsePublicObjectPath } from '@/lib/storage/media-url'
import { logEvent } from '@/lib/obs/log-event'

// STORE-001 — compensated-delete: xoá object storage CŨ từ URL công khai khi thay/gỡ cover/avatar.
//   Object per-entity (không shared) nên xoá an toàn. Best-effort: lỗi KHÔNG chặn nghiệp vụ (ref đã đổi
//   xong) → OBS_EVENT để quan sát; orphan job (cron) dọn nốt trường hợp lỗi. URL lạ/không parse → bỏ qua
//   (KHÔNG suy ra bucket/path để xoá nhầm).
export async function deleteStorageObjectByUrl(admin: SupabaseClient, url: string | null | undefined): Promise<void> {
  const obj = parsePublicObjectPath(url)
  if (!obj) return
  try {
    const { error } = await admin.storage.from(obj.bucket).remove([obj.path])
    if (error) logEvent('storage.orphan_delete_error', 'warn', { bucket: obj.bucket })
  } catch {
    logEvent('storage.orphan_delete_error', 'warn', { bucket: obj.bucket, kind: 'exception' })
  }
}
