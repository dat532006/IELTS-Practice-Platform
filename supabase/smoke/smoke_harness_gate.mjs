// TEST-HARNESS gate (TEST-002 rerunnable cleanup, TEST-003 fail-closed exit contract).
//   - Unit: smokeExit/statusOf/aggregateSmokes đúng hợp đồng mã thoát.
//   - NEGATIVE PREREQUISITE (chạy thật, KHÔNG cần Supabase): spawn activation smoke với .env.local tạm ẩn +
//     env Supabase rỗng → phải SKIPPED exit 3 (trước fix: exit 0 = PASS giả).
//   - Nguồn: activation smoke có cleanup children-first trong finally (rerunnable).
//     node supabase/smoke/smoke_harness_gate.mjs
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
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

console.log('\nTEST-003 — negative prerequisite (chạy thật): required smoke thiếu env → KHÔNG exit 0:')
{
  // Ẩn .env.local tạm + env Supabase rỗng → activation smoke phải SKIPPED (exit 3), KHÔNG PASS giả.
  const envFile = resolve(root, '.env.local')
  const bak = resolve(root, '.env.local.gatebak')
  const fs = await import('node:fs')
  let moved = false
  try {
    if (fs.existsSync(envFile)) { fs.renameSync(envFile, bak); moved = true }
    const clean = { ...process.env }
    for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'ACTIVATION_CODE_PEPPER']) delete clean[k]
    const r = spawnSync(process.execPath, [resolve(smokeDir, 'activation_codes_smoke.mjs')], { encoding: 'utf8', env: clean })
    const out = `${r.stdout || ''}${r.stderr || ''}`
    check('exit != 0 (không PASS giả)', r.status !== 0, `exit=${r.status}`)
    check('exit == 3 (SKIPPED required, fail-closed)', r.status === 3, `exit=${r.status}`)
    check('in SMOKE_RESULT status=SKIPPED', /SMOKE_RESULT .*"status":"SKIPPED"/.test(out), out.slice(-200))
  } finally {
    if (moved) fs.renameSync(bak, envFile) // luôn khôi phục .env.local
  }
}

console.log('\nTEST-002 — activation smoke rerunnable (cleanup children-first trong finally):')
const act = readFileSync(resolve(smokeDir, 'activation_codes_smoke.mjs'), 'utf8')
check('cleanup xoá activation_codes (con) TRƯỚC products (cha)', /delete\(\)\.in\('product_id', ids\)[\s\S]*from\('products'\)\.delete\(\)\.in\('id', ids\)/.test(act))
check('cleanup gọi trong finally + trước seed', /try \{[\s\S]*\} finally \{\s*\/\/[\s\S]*await cleanup\(ADMIN\.admin\)/.test(act) && /await cleanup\(ADMIN\.admin\)\n  const \{ data: prod/.test(act))
check('cleanup assert lỗi (throw) — không nuốt', /throw new Error\('cleanup delete activation_codes fail/.test(act))
check('dùng finishSmoke (exit contract) thay finish() cũ', /finishSmoke\(\{ name: NAME, passed: pass, failed: fail/.test(act) && !/function finish\(\)/.test(act))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
