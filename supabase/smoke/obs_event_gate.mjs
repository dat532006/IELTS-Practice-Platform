// DEPLOY-005 gate — chốt bất biến NGUỒN cho observability sự kiện tới hạn (chống revert về log chuỗi
// tự do / không tương quan / rò message thô). Bổ trợ obs_log_event_smoke.mjs (test hành vi redaction/
// correlation/format trên module production thật).
//   node supabase/smoke/obs_event_gate.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')
let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

// Các file đường tới hạn PHẢI đi qua logEvent (payment/security/scoring/storage). 0 console.* tự do.
const CRITICAL = [
  'app/api/payment/webhook/route.ts',
  'app/api/payment/webhook/sepay/route.ts',
  'app/api/payment/create/route.ts',
  'app/api/payment/qr-image/route.ts',
  'lib/payments/settle.ts',
  'lib/admin/product-search.ts',
  'lib/ai/writing-grader.ts',
]

console.log('DEPLOY-005 — helper log-event.ts: cấu trúc + redaction + marker:')
const helper = read('lib/obs/log-event.ts')
check('export buildEvent/formatEvent/logEvent/redactDetail',
  /export function buildEvent/.test(helper) && /export function formatEvent/.test(helper) && /export function logEvent/.test(helper) && /export function redactDetail/.test(helper))
check('denylist redaction có token/secret/password/signature/pepper/essay/email',
  ['token', 'secret', 'password', 'signature', 'pepper', 'essay', 'email'].every((k) => helper.includes(`'${k}'`)))
check('cắt chuỗi dài (MAX_STRING)', /MAX_STRING/.test(helper) && /slice\(0, MAX_STRING\)/.test(helper))
check('KHÔNG dump object/array lồng (chỉ tóm tắt)', /\[object\]/.test(helper) && /array\(\$\{/.test(helper))
check('marker OBS_EVENT cho log-scraper/alert adapter', /OBS_EVENT /.test(helper))
check('logEvent best-effort (không ném)', /catch \{ \/\* observability best-effort/.test(helper))
check('helper thuần — KHÔNG import server-only/không import runtime', !/import 'server-only'/.test(helper) && !/^import /m.test(helper))

console.log('\nDEPLOY-005 — correlation id (requestIdFrom):')
const resp = read('lib/api/response.ts')
check('response.ts export requestIdFrom', /export function requestIdFrom\(headers: Headers\)/.test(resp))
check('đọc x-request-id rồi x-vercel-id', /x-request-id/.test(resp) && /x-vercel-id/.test(resp))
check('sanitize id ([\\w-], ≤80)', /\[\\w-\]\{1,80\}/.test(resp))

console.log('\nDEPLOY-005 — mọi file tới hạn đi qua logEvent, 0 console.* tự do:')
for (const f of CRITICAL) {
  const src = read(f)
  const noConsole = !/console\.(error|warn|log)\(/.test(src)
  check(`${f}: import logEvent + gọi logEvent + 0 console.*`,
    /from '@\/lib\/obs\/log-event'/.test(src) && /logEvent\(/.test(src) && noConsole,
    noConsole ? '' : 'còn console.* tự do')
}

console.log('\nDEPLOY-005 — routes có request đính request_id để tương quan client↔log:')
for (const f of ['app/api/payment/webhook/route.ts', 'app/api/payment/webhook/sepay/route.ts', 'app/api/payment/qr-image/route.ts']) {
  const src = read(f)
  check(`${f}: derive requestIdFrom(request.headers) + truyền request_id`,
    /requestIdFrom\(request\.headers\)/.test(src) && /request_id: rid/.test(src))
}

console.log('\nDEPLOY-005 — KHÔNG rò message/secret thô ở đường tới hạn:')
check('settle.ts KHÔNG log error.message thô', !/error\.message/.test(read('lib/payments/settle.ts').split('\n').filter((l) => l.includes('logEvent') || l.includes('console')).join('\n')))
check('product-search.ts logEvent chỉ code (không message trong logEvent)',
  !/logEvent\([^)]*error\.message/.test(read('lib/admin/product-search.ts')))
const grader = read('lib/ai/writing-grader.ts')
check('writing-grader: 2 catch log scoring.provider_error (chỉ .name, không .message)',
  (grader.match(/scoring\.provider_error/g) ?? []).length === 2 && !/logEvent\([^)]*\)\?\.message/.test(grader) && /\(err as Error\)\?\.name/.test(grader))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
