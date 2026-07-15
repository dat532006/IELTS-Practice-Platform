// TEST-HARNESS gate (TEST-002 rerunnable cleanup, TEST-003 fail-closed exit contract).
//   - Unit: smokeExit/statusOf/aggregateSmokes đúng hợp đồng mã thoát.
//   - NEGATIVE PREREQUISITE (chạy thật, KHÔNG cần Supabase): spawn activation smoke với .env.local tạm ẩn +
//     env Supabase rỗng → phải SKIPPED exit 3 (trước fix: exit 0 = PASS giả).
//   - Nguồn: activation smoke có cleanup children-first trong finally (rerunnable).
//     node supabase/smoke/smoke_harness_gate.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { smokeExit, statusOf, aggregateSmokes } from './_harness.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const smokeDir = resolve(root, 'supabase', 'smoke')
let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

console.log('TEST-003 — hợp đồng mã thoát smokeExit:')
check('mọi pass → 0', smokeExit({ passed: 5, failed: 0 }) === 0)
check('có fail → 1', smokeExit({ passed: 3, failed: 2 }) === 1)
check('blocked → 2', smokeExit({ blocked: 1 }) === 2)
check('required + skipped → 3 (FAIL-CLOSED)', smokeExit({ skipped: 1, required: true }) === 3)
check('optional + skipped → 0 (không ồn dev)', smokeExit({ skipped: 1, required: false }) === 0)
check('fail ưu tiên hơn blocked/skip', smokeExit({ failed: 1, blocked: 1, skipped: 1 }) === 1)
check('statusOf skipped', statusOf({ skipped: 1 }) === 'SKIPPED' && statusOf({ passed: 2 }) === 'PASSED')

console.log('\nTEST-003 — runner aggregateSmokes fail-closed:')
check('required SKIPPED → runner exit 1', aggregateSmokes([{ name: 'a', status: 'SKIPPED', required: true }]).exit === 1)
check('required BLOCKED → runner exit 1', aggregateSmokes([{ name: 'a', status: 'BLOCKED', required: true }]).exit === 1)
check('optional SKIPPED → runner exit 0', aggregateSmokes([{ name: 'a', status: 'SKIPPED', required: false }]).exit === 0)
check('tất cả PASSED → exit 0', aggregateSmokes([{ name: 'a', status: 'PASSED', required: true }, { name: 'b', status: 'PASSED', required: true }]).exit === 0)
{
  const agg = aggregateSmokes([{ name: 'a', status: 'PASSED', required: true }, { name: 'b', status: 'SKIPPED', required: true }, { name: 'c', status: 'SKIPPED', required: false }])
  check('đếm đúng executed/skipped + requiredNotPassed', agg.totals.passed === 1 && agg.totals.skipped === 2 && agg.totals.requiredNotPassed === 1 && agg.exit === 1)
}

console.log('\nTEST-003 — negative prerequisite contract:')
const prereqSource = readFileSync(resolve(smokeDir, 'activation_codes_smoke.mjs'), 'utf8')
check('missing Supabase env is required SKIPPED (not pass)',
  /!url \|\| !anon \|\| !service[\s\S]*finishSmoke\(\{ name: NAME, skipped: 1, required: true \}\)/.test(prereqSource))
check('missing activation pepper is required BLOCKED (not pass)',
  /!pepper[\s\S]*finishSmoke\(\{ name: NAME, blocked: 1, required: true \}\)/.test(prereqSource))

console.log('\nTEST-002 — activation smoke rerunnable (cleanup children-first trong finally):')
const act = readFileSync(resolve(smokeDir, 'activation_codes_smoke.mjs'), 'utf8')
const deleteCodesAt = act.indexOf("from('activation_codes').delete()")
const deleteProductsAt = act.indexOf("from('products').delete()")
check('cleanup xoá activation_codes (con) TRƯỚC products (cha)',
  deleteCodesAt >= 0 && deleteProductsAt > deleteCodesAt)
const firstCleanupAt = act.indexOf('await cleanup(ADMIN.admin)')
const seedAt = act.indexOf("from('products').insert")
const finallyAt = act.indexOf('} finally {')
const finallyCleanupAt = act.indexOf('await cleanup(ADMIN.admin)', finallyAt)
check('cleanup gọi trước seed và trong finally',
  firstCleanupAt >= 0 && seedAt > firstCleanupAt && finallyAt >= 0 && finallyCleanupAt > finallyAt)
check('cleanup assert lỗi (throw) — không nuốt', /throw new Error\('cleanup delete activation_codes fail/.test(act))
check('dùng finishSmoke (exit contract) thay finish() cũ', /finishSmoke\(\{ name: NAME, passed: pass, failed: fail/.test(act) && !/function finish\(\)/.test(act))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
