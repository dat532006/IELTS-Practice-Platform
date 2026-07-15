// ADMIN-007 gate — Eventual + observable cho catalog consistency (Owner chốt: KHÔNG outbox).
// (1) observability: refresh fail → OBS_EVENT catalog.refresh_error (batch 32). (2) safety-net: cron refresh
// định kỳ heal stale kể cả khi không có mutation kế; ghi cron_runs (quan sát). Gate chốt cả 2.
//   node supabase/smoke/catalog_refresh_cron_gate.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')
let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

console.log('ADMIN-007 — observability (đã có batch 32):')
const ps = read('lib/admin/product-search.ts')
check('refreshProductSearch fail → logEvent catalog.refresh_error', /logEvent\('catalog\.refresh_error'/.test(ps))
check('KHÔNG log error.message thô (chỉ code)', !/logEvent\([^)]*error\.message/.test(ps))

console.log('\nADMIN-007 — safety-net cron refresh-catalog (heal stale, quan sát cron_runs):')
const route = read('app/api/cron/refresh-catalog/route.ts')
check('CRON_SECRET thiếu → 503 fail-closed', /if \(!secret\)[\s\S]*status: 503/.test(route))
check('auth bearer timing-safe', /timingSafeEqual/.test(route))
check('gọi refreshProductSearch (RPC idempotent)', /refreshProductSearch\(admin\)/.test(route))
check('ghi cron_runs SUCCESS + FAILURE', /recordRun\(admin, true,/.test(route) && /recordRun\(admin, false,/.test(route))
check('audit best-effort (nuốt lỗi, không hỏng job)', /catch \{ \/\* audit best-effort/.test(route))
check('job name = refresh-catalog', /job: 'refresh-catalog'/.test(route))

console.log('\nADMIN-007 — vercel.json đăng ký cron refresh-catalog:')
const vercel = JSON.parse(read('vercel.json'))
const crons = vercel.crons ?? []
check('có đúng 1 cron cho refresh-catalog', crons.filter((c) => c.path === '/api/cron/refresh-catalog').length === 1, JSON.stringify(crons))
check('mọi cron có schedule', crons.every((c) => typeof c.schedule === 'string' && c.schedule.length > 0))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
