// DEPLOY-001 gate — cron reconcile: 1 nguồn lịch (vercel.json) + fail-closed secret + idempotent +
// observable (ghi cron_runs cả success lẫn failure). Migration/RLS đã verify THẬT qua db:verify PG17
// (check39 cron_runs client-denied). Gate này chốt invariant nguồn (chống revert).
//   node supabase/smoke/cron_reconcile_gate.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')
let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

console.log('DEPLOY-001 — 1 nguồn lịch (vercel.json):')
const vercel = JSON.parse(read('vercel.json'))
const crons = vercel.crons ?? []
check('đúng 1 cron cho reconcile-topups', crons.filter((c) => c.path === '/api/cron/reconcile-topups').length === 1, JSON.stringify(crons))
check('mỗi cron có schedule', crons.every((c) => typeof c.schedule === 'string' && c.schedule.length > 0))

console.log('\nDEPLOY-001 — route fail-closed + idempotent + observable:')
const route = read('app/api/cron/reconcile-topups/route.ts')
check('CRON_SECRET thiếu → 503 fail-closed', /if \(!secret\)[\s\S]*status: 503/.test(route))
check('auth bearer timing-safe', /timingSafeEqual/.test(route))
check('chỉ gọi expire_pending_topups (KHÔNG credit)', /rpc\('expire_pending_topups'\)/.test(route) && !/credit|add.*coin/i.test(route.replace(/\/\/.*/g, '')))
check('ghi cron_runs khi SUCCESS', /recordRun\(admin, true, \{ expired \}\)/.test(route))
check('ghi cron_runs khi FAILURE', /recordRun\(admin, false,/.test(route))
check('audit best-effort (nuốt lỗi, không hỏng job)', /insert\(\{ job: 'reconcile-topups'[\s\S]*catch \{ \/\* audit best-effort/.test(route))

console.log('\nDEPLOY-001 — cron_runs bền + service_role-only:')
const mig = read('supabase/migrations/20260715000100_cron_runs.sql')
check('bảng cron_runs {job, ok, detail}', /create table if not exists public\.cron_runs/.test(mig) && /ok\s+boolean not null/.test(mig) && /detail\s+jsonb/.test(mig))
check('RLS on + chỉ grant service_role', /enable row level security/.test(mig) && /grant select, insert on public\.cron_runs to service_role/.test(mig) && !/to (anon|authenticated)/.test(mig))
check('rls_smoke check39 cron_runs client-denied', /check39: cron_runs denied to client/.test(read('supabase/tests/rls_smoke.sql')))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
