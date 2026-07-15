// ============================================================
// TEST-003 — Runner smoke fail-closed cho CI. Chạy các smoke, đọc dòng máy `SMOKE_RESULT {json}` (hoặc
//   suy từ exit code), tổng hợp executed/skipped/failed/blocked. Mọi smoke REQUIRED KHÔNG PASSED →
//   runner exit 1 (KHÔNG cho CI báo PASS giả khi smoke bị SKIP/BLOCKED). Optional smoke SKIP → không chặn.
//   Phân loại required/optional ở OPTIONAL bên dưới (Owner tinh chỉnh — mục "Owner: classify optional").
// Dùng: node scripts/run-smokes.mjs [--only <substr>]   (SMOKE_BASE/env truyền như bình thường)
// ============================================================
import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { aggregateSmokes } from '../supabase/smoke/_harness.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const smokeDir = resolve(root, 'supabase', 'smoke')

// OPTIONAL: smoke phụ thuộc provider/dịch vụ NGOÀI (live gateway, live AI eval) — SKIP không chặn CI.
//   Owner phân loại lại tuỳ hạ tầng pre-prod. Mặc định: MỌI smoke khác = REQUIRED (fail-closed).
const OPTIONAL = new Set([
  'writing_eval.mjs', // đánh giá AI thật — cần key provider (Owner)
])

const onlyIdx = process.argv.indexOf('--only')
const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null

const files = readdirSync(smokeDir)
  .filter((f) => f.endsWith('.mjs') && !f.startsWith('_')) // _harness.mjs… là thư viện, không phải smoke
  .filter((f) => (only ? f.includes(only) : true))
  .sort()

const results = []
for (const f of files) {
  const required = !OPTIONAL.has(f)
  const r = spawnSync(process.execPath, [resolve(smokeDir, f)], { encoding: 'utf8', env: process.env })
  const out = `${r.stdout || ''}${r.stderr || ''}`
  const m = out.match(/SMOKE_RESULT (\{.*\})/)
  let status
  if (m) {
    try { status = JSON.parse(m[1]).status } catch { status = null }
  }
  // Fallback nếu smoke chưa in SMOKE_RESULT: suy từ exit code (0=PASSED,1=FAILED,2=BLOCKED,3=SKIPPED).
  if (!status) status = ({ 0: 'PASSED', 1: 'FAILED', 2: 'BLOCKED', 3: 'SKIPPED' })[r.status] ?? 'BLOCKED'
  results.push({ name: f, status, required })
  const tag = status === 'PASSED' ? '✅' : status === 'SKIPPED' ? (required ? '⛔SKIP' : '⏭️skip') : status === 'BLOCKED' ? '⛔BLOCKED' : '❌FAIL'
  console.log(`${tag}  ${f}${required ? '' : ' (optional)'}`)
}

const { exit, totals } = aggregateSmokes(results)
console.log('\n' + '─'.repeat(48))
console.log(`Tổng: ${totals.total} | PASSED ${totals.passed} | FAILED ${totals.failed} | SKIPPED ${totals.skipped} | BLOCKED ${totals.blocked}`)
console.log(`Required chưa PASS: ${totals.requiredNotPassed} → runner ${exit === 0 ? 'PASS (exit 0)' : 'FAIL-CLOSED (exit 1)'}`)
console.log(`SMOKE_RUN_RESULT ${JSON.stringify({ ...totals, exit })}`)
process.exit(exit)
