// STORE-001 — compensated-delete + orphan job: khi thay/gỡ cover/avatar, object CŨ phải bị xoá (không
// orphan). Import helper production parsePublicObjectPath (URL công khai → {bucket,path}) + isOrphanObject
// (quyết định xoá theo grace + reference). Pre-fix RED: module chưa tồn tại.
//   node supabase/smoke/storage_orphan_smoke.mjs
import { parsePublicObjectPath } from '../../lib/storage/media-url.ts'
import { isOrphanObject } from '../../lib/storage/orphan.ts'

// Set env để allowlist origin (parse dùng chung origin allowlist với isAllowedPublicMediaUrl).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co'

let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

console.log('STORE-001 — parsePublicObjectPath (URL công khai → {bucket, path}):')
{
  const u = 'https://proj.supabase.co/storage/v1/object/public/media/images/test123/1720000000-cover.png'
  const r = parsePublicObjectPath(u)
  check('media bucket + path đúng', r && r.bucket === 'media' && r.path === 'images/test123/1720000000-cover.png')
  const a = parsePublicObjectPath('https://proj.supabase.co/storage/v1/object/public/avatars/uid/1720.png')
  check('avatars bucket + path đúng', a && a.bucket === 'avatars' && a.path === 'uid/1720.png')
  check('origin lạ → null (không xoá nhầm bucket ngoài)', parsePublicObjectPath('https://evil.com/storage/v1/object/public/media/x.png') === null)
  check('javascript:/data: → null', parsePublicObjectPath('javascript:alert(1)') === null && parsePublicObjectPath('data:text/plain,x') === null)
  check('path không phải object public → null', parsePublicObjectPath('https://proj.supabase.co/other/media/x.png') === null)
  check('null/rỗng → null', parsePublicObjectPath(null) === null && parsePublicObjectPath('') === null)
}

console.log('\nSTORE-001 — isOrphanObject (xoá khi CŨ hơn grace + KHÔNG được tham chiếu):')
{
  const now = Date.parse('2026-07-16T00:00:00Z')
  const referenced = new Set(['images/t1/live.png', 'uid/current.png'])
  const old = '2026-07-01T00:00:00Z' // 15 ngày trước
  const recent = '2026-07-15T12:00:00Z' // 12h trước
  check('object cũ + KHÔNG tham chiếu → orphan (xoá)', isOrphanObject(old, 'images/t1/deleted.png', referenced, 7, now) === true)
  check('object cũ NHƯNG đang tham chiếu → KHÔNG xoá', isOrphanObject(old, 'images/t1/live.png', referenced, 7, now) === false)
  check('object không tham chiếu NHƯNG còn trong grace → KHÔNG xoá (chống race upload↔ghi ref)', isOrphanObject(recent, 'images/t1/deleted.png', referenced, 7, now) === false)
  check('avatar cũ không tham chiếu → orphan', isOrphanObject(old, 'uid/deleted.png', referenced, 7, now) === true)
  check('created_at không parse được → KHÔNG xoá (an toàn)', isOrphanObject('not-a-date', 'x/y.png', referenced, 7, now) === false)
  check('grace 0 + cũ + không ref → orphan', isOrphanObject(old, 'x/y.png', referenced, 0, now) === true)
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
