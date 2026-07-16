// Writing grader reliability gate (AI-001 deadline + AI-002 explicit provider).
//   AI-002: selectProvider — WRITING_AI_PROVIDER lạ (typo) PHẢI fail-loud (ok:false), KHÔNG âm thầm đổi
//     provider theo key. Chỉ tự chọn theo key khi KHÔNG set.
//   AI-001: gradeTimeoutMs bounded/hợp lệ; và cơ chế deadline (AbortSignal.timeout) mà cả 2 provider dùng
//     HỦY được lời gọi treo — pre-fix (fetch không signal) treo qua deadline.
//   Import trực tiếp lib/ai/provider-select.ts (Node type-strip: không server-only, không import).
//     node supabase/smoke/writing_grader_reliability_gate.mjs
import http from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const { selectProvider, gradeTimeoutMs } = await import('../../lib/ai/provider-select.ts')
const { fetchWithDeadline } = await import('../../lib/net/fetch-deadline.ts')

let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

// ---------- AI-002: explicit provider selection ----------
console.log('AI-002 — chọn provider tường minh:')
check('WRITING_AI_PROVIDER=openai → explicit openai',
  JSON.stringify(selectProvider({ WRITING_AI_PROVIDER: 'openai', ANTHROPIC_API_KEY: 'x' })) === JSON.stringify({ ok: true, provider: 'openai', reason: 'explicit' }))
check('WRITING_AI_PROVIDER=anthropic → explicit anthropic',
  JSON.stringify(selectProvider({ WRITING_AI_PROVIDER: 'anthropic', OPENAI_API_KEY: 'x' })) === JSON.stringify({ ok: true, provider: 'anthropic', reason: 'explicit' }))
check('  ANTHROPIC  (whitespace/case) → explicit anthropic',
  selectProvider({ WRITING_AI_PROVIDER: '  Anthropic  ' }).provider === 'anthropic')

// LÕI CỐT LÕI AI-002: provider lạ + có key → PHẢI fail-loud, KHÔNG âm thầm chọn provider theo key
const r1 = selectProvider({ WRITING_AI_PROVIDER: 'gemini', ANTHROPIC_API_KEY: 'x', OPENAI_API_KEY: 'y' })
check('provider lạ (gemini) + có key → ok:false invalid_config (KHÔNG đổi provider)',
  r1.ok === false && r1.reason === 'invalid_config', JSON.stringify(r1))
const r2 = selectProvider({ WRITING_AI_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'x' }) // 'claude' KHÔNG phải 'anthropic'
check('provider lạ (claude) → ok:false (không map mờ)', r2.ok === false, JSON.stringify(r2))
const r3 = selectProvider({ WRITING_AI_PROVIDER: 'openai; drop', OPENAI_API_KEY: 'y' })
check('provider rác → ok:false', r3.ok === false, JSON.stringify(r3))

// AI-004 (Owner chốt 2026-07-16): provider = OpenAI. Mặc định code ĐỔI sang openai để quên
//   WRITING_AI_PROVIDER ở môi trường mới (preview/staging) KHÔNG âm thầm chạy Anthropic — đó là tiền
//   của Owner ở provider không định dùng. Adapter Anthropic giữ lại làm đường lui (set explicit).
console.log('\nAI-002/AI-004 — auto theo key khi KHÔNG set (OpenAI ưu tiên):')
check('unset + chỉ ANTHROPIC key → key anthropic (đường lui vẫn dùng được)',
  selectProvider({ ANTHROPIC_API_KEY: 'x' }).reason === 'key' && selectProvider({ ANTHROPIC_API_KEY: 'x' }).provider === 'anthropic')
check('unset + chỉ OPENAI key → key openai',
  selectProvider({ OPENAI_API_KEY: 'y' }).provider === 'openai')
// BẤT BIẾN AI-004: cả 2 key → OpenAI thắng (trước đây anthropic thắng).
check('unset + cả 2 key → OPENAI ưu tiên (không phải anthropic)',
  selectProvider({ ANTHROPIC_API_KEY: 'x', OPENAI_API_KEY: 'y' }).provider === 'openai',
  JSON.stringify(selectProvider({ ANTHROPIC_API_KEY: 'x', OPENAI_API_KEY: 'y' })))
// BẤT BIẾN AI-004: không key → default PHẢI là openai (khoá cả provider, không chỉ reason).
const dflt = selectProvider({})
check('unset + không key → default OPENAI (nhánh live thiếu key → AI_UNAVAILABLE)',
  dflt.ok === true && dflt.provider === 'openai' && dflt.reason === 'default', JSON.stringify(dflt))
check('AI-004: KHÔNG môi trường nào rơi về anthropic khi chưa cấu hình gì',
  selectProvider({}).provider !== 'anthropic')
console.log('\nAI-001 — OpenAI Responses API contract:')
const graderSource = readFileSync(resolve(root, 'lib', 'ai', 'writing-grader.ts'), 'utf8')
check('uses Responses API (not legacy Chat Completions)',
  graderSource.includes('https://api.openai.com/v1/responses') &&
  !graderSource.includes('https://api.openai.com/v1/chat/completions'))
check('uses strict Structured Outputs', /text:\s*\{[\s\S]*format:\s*\{[\s\S]*type: 'json_schema'[\s\S]*strict: true/.test(graderSource))
check('OpenAI key remains server-only', /process\.env\.OPENAI_API_KEY/.test(graderSource) && !/NEXT_PUBLIC_OPENAI/.test(graderSource))
check('balanced default model is explicit', /WRITING_GRADER_OPENAI_MODEL \|\| 'gpt-5\.6-terra'/.test(graderSource))

check('rỗng "" coi như unset', selectProvider({ WRITING_AI_PROVIDER: '', OPENAI_API_KEY: 'y' }).provider === 'openai')

// ---------- AI-001: deadline bounded ----------
console.log('\nAI-001 — deadline gọi provider bounded:')
check('gradeTimeoutMs mặc định = 60000', gradeTimeoutMs({}) === 60000)
check('override 90000 được tôn trọng', gradeTimeoutMs({ WRITING_GRADER_TIMEOUT_MS: '90000' }) === 90000)
check('override phi số → mặc định', gradeTimeoutMs({ WRITING_GRADER_TIMEOUT_MS: 'abc' }) === 60000)
check('override 0 (quá nhỏ) → mặc định', gradeTimeoutMs({ WRITING_GRADER_TIMEOUT_MS: '0' }) === 60000)
check('override khổng lồ → kẹp trần 290000', gradeTimeoutMs({ WRITING_GRADER_TIMEOUT_MS: '999999999' }) === 290000)

// cơ chế deadline thực: server treo (không phản hồi). fetchWithDeadline (mà OpenAI path dùng) PHẢI abort;
//   fetch thô (pre-fix) KHÔNG settle trong deadline → chứng minh bug unbounded.
const server = http.createServer(() => { /* không bao giờ phản hồi → treo */ })
await new Promise((res) => server.listen(0, '127.0.0.1', res))
const port = server.address().port
const url = `http://127.0.0.1:${port}/`
const DEADLINE = 400

// post-fix: bounded abort trong ~DEADLINE
const t0 = Date.now()
let aborted = false, tookMs = 0
try { await fetchWithDeadline(url, {}, DEADLINE) } catch (e) { aborted = e?.name === 'TimeoutError' || e?.name === 'AbortError' } finally { tookMs = Date.now() - t0 }
check('fetchWithDeadline HỦY provider treo (TimeoutError)', aborted, `took=${tookMs}ms`)
check(`abort trong ~deadline (< ${DEADLINE + 500}ms)`, tookMs < DEADLINE + 500, `took=${tookMs}ms`)

// pre-fix chứng minh: fetch THÔ (không signal) không settle trong deadline → treo (đua với marker)
const raw = fetch(url).then(() => 'settled').catch(() => 'errored')
const marker = new Promise((r) => { const h = setTimeout(() => r('hung'), DEADLINE); if (h.unref) h.unref() })
const rawResult = await Promise.race([raw, marker])
check('fetch thô KHÔNG deadline → treo qua mốc (bug pre-fix)', rawResult === 'hung', `got=${rawResult}`)

server.closeAllConnections?.()
await new Promise((res) => server.close(res))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
