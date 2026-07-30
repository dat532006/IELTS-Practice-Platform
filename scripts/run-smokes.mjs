// ============================================================
// TEST-003 — Runner smoke fail-closed cho CI. Chạy các smoke, đọc dòng máy `SMOKE_RESULT {json}` (hoặc
//   suy từ exit code), tổng hợp executed/skipped/failed/blocked. Mọi smoke REQUIRED KHÔNG PASSED →
//   runner exit 1 (KHÔNG cho CI báo PASS giả khi smoke bị SKIP/BLOCKED). Optional smoke SKIP → không chặn.
//   Phân loại required/optional ở OPTIONAL bên dưới (Owner tinh chỉnh — mục "Owner: classify optional").
// Dùng: node scripts/run-smokes.mjs [--only <substr>] [--no-infra]
//   (SMOKE_BASE/env truyền như bình thường)
//
// --no-infra: chế độ cho CI KHÔNG có Supabase/gateway/AI key. Vẫn chạy TOÀN BỘ smoke — không lọc theo
//   danh sách nào cả — nhưng chỉ coi FAILED (assertion sai) là chặn; SKIPPED/BLOCKED vì thiếu hạ tầng
//   thì bỏ qua. Cố ý không dùng "danh sách gate tĩnh": danh sách sẽ mục, và một gate bị rơi khỏi danh
//   sách là gate ngừng chạy trong im lặng — đúng thứ chế độ này sinh ra để chống.
// ============================================================
import { readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { aggregateSmokes } from '../supabase/smoke/_harness.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const smokeDir = resolve(root, 'supabase', 'smoke')
// Hermetic local runner: load the same .env.local contract that individual
// smokes use. Explicit process env always wins (CI/staging overrides).
try {
  for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!match || process.env[match[1]]) continue
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2')
    process.env[match[1]] = value
  }
} catch {
  // CI may provide all variables without an .env.local file.
}

// OPTIONAL: smoke phụ thuộc provider/dịch vụ NGOÀI (live gateway, live AI eval) — SKIP không chặn CI.
//   Owner phân loại lại tuỳ hạ tầng pre-prod. Mặc định: MỌI smoke khác = REQUIRED (fail-closed).
const OPTIONAL = new Set([
  'writing_eval.mjs', // đánh giá AI thật — cần key provider (Owner)
])

const onlyIdx = process.argv.indexOf('--only')
const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null
const noInfra = process.argv.includes('--no-infra')

const files = readdirSync(smokeDir)
  .filter((f) => f.endsWith('.mjs') && !f.startsWith('_')) // _harness.mjs… là thư viện, không phải smoke
  .filter((f) => (only ? f.includes(only) : true))
  .sort()

const results = []
for (const f of files) {
  const required = !OPTIONAL.has(f)
  const smokeEnv = { ...process.env }
  // The generic HMAC webhook is intentionally disabled in live mode. Allow CI
  // to route only its legacy sandbox contract to a separately configured app;
  // SePay/VNPay/MoMo live smokes continue to use SMOKE_BASE.
  if (f === 'payment_smoke.mjs' && process.env.SMOKE_SANDBOX_BASE) {
    smokeEnv.SMOKE_BASE = process.env.SMOKE_SANDBOX_BASE
  }
  const r = spawnSync(process.execPath, [resolve(smokeDir, f)], { encoding: 'utf8', env: smokeEnv })
  const out = `${r.stdout || ''}${r.stderr || ''}`
  const m = out.match(/SMOKE_RESULT (\{.*\})/)
  let status
  if (m) {
    try { status = JSON.parse(m[1]).status } catch { status = null }
  }
  // Fallback nếu smoke chưa in SMOKE_RESULT: suy từ exit code (0=PASSED,1=FAILED,2=BLOCKED,3=SKIPPED).
  if (!status) status = ({ 0: 'PASSED', 1: 'FAILED', 2: 'BLOCKED', 3: 'SKIPPED' })[r.status] ?? 'BLOCKED'
  // Smoke cần Supabase/gateway mà không dùng đường BLOCKED của harness thì chết bằng exception mạng và
  //   ra FAILED — giống hệt assertion sai. --no-infra phải tách được hai thứ đó, nếu không nó vô dụng.
  //   CỐ Ý không nhận ERR_MODULE_NOT_FOUND là "thiếu hạ tầng": đó là smoke HỎNG (import sai), và chính
  //   nó đã giấu gate sanitize SEC-006 suốt một thời gian dài.
  const noInfraSignature = /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|Missing required environment variable|SUPABASE_(URL|SERVICE_ROLE_KEY|ANON_KEY) /
  results.push({ name: f, status, required, infraAbsent: status !== 'PASSED' && noInfraSignature.test(out) })
  const tag = status === 'PASSED' ? '✅' : status === 'SKIPPED' ? (required ? '⛔SKIP' : '⏭️skip') : status === 'BLOCKED' ? '⛔BLOCKED' : '❌FAIL'
  console.log(`${tag}  ${f}${required ? '' : ' (optional)'}`)
  if (status !== 'PASSED' && out.trim()) console.error(out.trim())
}

const { exit: strictExit, totals } = aggregateSmokes(results)
console.log('\n' + '─'.repeat(48))
console.log(`Tổng: ${totals.total} | PASSED ${totals.passed} | FAILED ${totals.failed} | SKIPPED ${totals.skipped} | BLOCKED ${totals.blocked}`)

let exit = strictExit
if (noInfra) {
  // Chỉ lỗi THẬT mới chặn. Thiếu Supabase/gateway/AI key là chuyện của môi trường, không phải lỗi code.
  const real = results.filter((r) => r.status !== 'PASSED' && !r.infraAbsent)
  const skippedForInfra = results.filter((r) => r.infraAbsent)
  exit = real.length > 0 ? 1 : 0
  console.log(`--no-infra: chạy được ${totals.passed} | lỗi thật ${real.length} | bỏ qua vì thiếu hạ tầng ${skippedForInfra.length}`)
  if (real.length) console.log(`Lỗi thật ở: ${real.map((r) => `${r.name} (${r.status})`).join(', ')}`)
  console.log(`→ runner ${exit === 0 ? 'PASS (exit 0)' : 'FAIL (exit 1)'}`)
} else {
  console.log(`Required chưa PASS: ${totals.requiredNotPassed} → runner ${exit === 0 ? 'PASS (exit 0)' : 'FAIL-CLOSED (exit 1)'}`)
}
console.log(`SMOKE_RUN_RESULT ${JSON.stringify({ ...totals, mode: noInfra ? 'no-infra' : 'full', exit })}`)
process.exit(exit)
