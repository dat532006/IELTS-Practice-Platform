// STORE-001 gate — chốt bất biến NGUỒN cho compensated-delete + orphan job (chống revert về để orphan).
// Bổ trợ storage_orphan_smoke.mjs (hành vi parse + isOrphanObject).
//   node supabase/smoke/storage_orphan_gate.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')
let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

console.log('STORE-001 — helper thuần:')
const mu = read('lib/storage/media-url.ts')
check('parsePublicObjectPath chỉ nhận URL hợp lệ (isAllowedPublicMediaUrl)', /export function parsePublicObjectPath/.test(mu) && /if \(!isAllowedPublicMediaUrl\(raw\)\) return null/.test(mu))
const orphan = read('lib/storage/orphan.ts')
check('orphan.ts thuần + isOrphanObject/orphanGraceDays/orphanCleanupEnabled', /export function isOrphanObject/.test(orphan) && /export function orphanGraceDays/.test(orphan) && /export function orphanCleanupEnabled/.test(orphan) && !/^import /m.test(orphan))
check('isOrphanObject: ref → giữ; trong grace → giữ; parse lỗi → giữ (an toàn)',
  /if \(referenced\.has\(path\)\) return false/.test(orphan) && /ageMs > graceMs/.test(orphan) && /Number\.isNaN\(created\)\) return false/.test(orphan))
check('grace mặc định 7; cleanup mặc định dry-run (enabled cần =true)',
  /return Number\.isFinite\(raw\) && raw >= 0 \? raw : 7/.test(orphan) && /STORAGE_ORPHAN_CLEANUP_ENABLED === 'true'/.test(orphan))

console.log('\nSTORE-001 — compensated-delete (server cover + client avatar):')
const del = read('lib/storage/delete-object.ts')
check('deleteStorageObjectByUrl best-effort + OBS_EVENT', /export async function deleteStorageObjectByUrl/.test(del) && /logEvent\('storage\.orphan_delete_error'/.test(del))
const tests = read('lib/admin/tests.ts')
check('setTestMeta đọc cover CŨ + xoá khi đổi (compensated-delete)',
  /select\('cover_image'\)/.test(tests) && /oldCover && oldCover !== patch\.cover_image/.test(tests) && /deleteStorageObjectByUrl\(admin, oldCover\)/.test(tests))
const pp = read('components/account/ProfilePanel.tsx')
check('ProfilePanel xoá avatar cũ khi thay + gỡ', (pp.match(/removeStorageObject\(supabase, oldAvatar/g) ?? []).length === 2 && /parsePublicObjectPath\(oldUrl\)/.test(pp))
check('removeStorageObject bỏ qua khi url cũ === mới (không xoá nhầm)', /if \(!oldUrl \|\| oldUrl === newUrl\) return/.test(pp))

console.log('\nSTORE-001 — orphan job cron (safety-net, dry-run default):')
const cron = read('app/api/cron/cleanup-orphans/route.ts')
check('CRON_SECRET thiếu → 503 fail-closed + bearer timing-safe', /if \(!secret\) return fail\('INTERNAL'[\s\S]*status: 503/.test(cron) && /timingSafeEqual/.test(cron))
check('dùng orphanCleanupEnabled (dry-run mặc định) + orphanGraceDays', /orphanCleanupEnabled\(\)/.test(cron) && /orphanGraceDays\(\)/.test(cron))
check('sweep media(tests.cover_image) + avatars(profiles.avatar)', /sweepBucket\(admin, [^,]+, 'tests', 'cover_image'/.test(cron) && /sweepBucket\(admin, 'avatars', 'profiles', 'avatar'/.test(cron))
check('CHỈ xoá khi enabled (dry-run KHÔNG remove)', /if \(enabled && orphanPaths\.length > 0\)/.test(cron))
check('reference-check: object đang tham chiếu KHÔNG xoá (collectReferenced)', /collectReferenced\(admin, table, column, bucket\)/.test(cron))
check('list có cap (bounded)', /MAX_OBJECTS/.test(cron))
check('DB/list error aborts sweep before delete (STORE-004)',
  /if \(error\) throw new Error\(`reference_query_failed:/.test(cron) &&
  /if \(error\) throw new Error\(`storage_list_failed:/.test(cron))
check('ghi cron_runs (job cleanup-orphans) + detail dry_run', /job: 'cleanup-orphans'/.test(cron) && /dry_run: !enabled/.test(cron))

console.log('\nSTORE-001 — vercel.json cron + env contract:')
const vercel = JSON.parse(read('vercel.json'))
check('có cron cleanup-orphans', (vercel.crons ?? []).filter((c) => c.path === '/api/cron/cleanup-orphans').length === 1)
const env = read('lib/env.ts')
check('env registry có STORAGE_ORPHAN_GRACE_DAYS + STORAGE_ORPHAN_CLEANUP_ENABLED', /STORAGE_ORPHAN_GRACE_DAYS/.test(env) && /STORAGE_ORPHAN_CLEANUP_ENABLED/.test(env))
check('.env.example có 2 biến (chống drift env_contract_gate)', /STORAGE_ORPHAN_GRACE_DAYS/.test(read('.env.example')) && /STORAGE_ORPHAN_CLEANUP_ENABLED/.test(read('.env.example')))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
