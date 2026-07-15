// EXAM-003/009 gate — chốt bất biến NGUỒN cho snapshot-at-start (chống revert về đọc tests hiện tại /
// phụ thuộc /api/exam published-only). Bổ trợ exam_review_snapshot_smoke.mjs (hành vi pickReviewContent).
//   node supabase/smoke/exam_snapshot_gate.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')
let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

console.log('EXAM-003/009 — migration snapshot service_role-only + RLS check:')
const mig = read('supabase/migrations/20260715000300_attempt_content_snapshots.sql')
check('bảng attempt_content_snapshots (attempt_id PK → attempts, on delete cascade)',
  /create table if not exists public\.attempt_content_snapshots/.test(mig) && /attempt_id\s+uuid primary key references public\.attempts\(id\) on delete cascade/.test(mig))
check('lưu passages+questions jsonb + captured_at', /passages\s+jsonb/.test(mig) && /questions\s+jsonb/.test(mig) && /captured_at/.test(mig))
check('RLS on + chỉ grant service_role (deny client)',
  /enable row level security/.test(mig) && /grant select, insert on public\.attempt_content_snapshots to service_role/.test(mig) && !/to (anon|authenticated)/.test(mig))
check('rls_smoke check40 client-denied', /check40: attempt_content_snapshots denied to client/.test(read('supabase/tests/rls_smoke.sql')))

console.log('\nEXAM-003/009 — helper thuần + capture lúc START:')
const rc = read('lib/exam/review-content.ts')
check('review-content.ts export pickReviewContent, thuần', /export function pickReviewContent/.test(rc) && !/^import /m.test(rc))
const att = read('lib/exam/attempt.ts')
check('startAttempt chụp snapshot cho attempt VỪA TẠO (best-effort)',
  /captureContentSnapshot\(admin, attempt\.id, testId\)/.test(att) && /insert\(\{[\s\S]*attempt_id: attemptId/.test(att))
check('capture best-effort (lỗi → logEvent, không chặn vào thi)', /logEvent\('exam\.snapshot_error'/.test(att))

console.log('\nEXAM-009 — getResult đọc snapshot + build review từ nội dung bản chụp:')
const res = read('lib/exam/result.ts')
check('đọc attempt_content_snapshots theo attempt_id', /from\('attempt_content_snapshots'\)[\s\S]*eq\('attempt_id', a\.id\)/.test(res))
check('pickReviewContent(snap, current)', /pickReviewContent\(snap, \{ passages: testRow\.passages, questions: testRow\.questions \}\)/.test(res))
check('buildReviewItems từ content.questions (KHÔNG tests.questions trực tiếp)',
  /buildReviewItems\(a\.answers, keys as Record<string, unknown>, content\.questions\)/.test(res))
check('trả content{passages sanitize, questions, audio_url} + content_stale',
  /content: \{ passages: sanitizePassages\(content\.passages\), questions: content\.questions, audio_url \}/.test(res) && /content_stale: content\.stale/.test(res))

console.log('\nEXAM-003 — review KHÔNG còn phụ thuộc /api/exam published-only:')
const loader = read('components/result/ExamReviewLoader.tsx')
check('ExamReviewLoader KHÔNG fetch /api/exam nữa', !/\/api\/exam\//.test(loader))
check('payload dựng từ result.content (bản chụp)', /passages: result\.content\.passages/.test(loader) && /questions: result\.content\.questions/.test(loader))
check('truyền contentStale xuống ExamRunner', /contentStale: dto\.content_stale/.test(loader))

console.log('\nEXAM-003/009 — type + UI cờ stale:')
check('ResultDTO có content + content_stale', /content: \{ passages: unknown; questions: unknown; audio_url: string \| null \}/.test(read('types/exam.ts')) && /content_stale: boolean/.test(read('types/exam.ts')))
const runner = read('components/exam/ExamRunner.tsx')
check('ExamRunner review prop có contentStale + banner "bản gốc có thể đã đổi"',
  /contentStale\?: boolean/.test(runner) && /review\?\.contentStale/.test(runner))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
