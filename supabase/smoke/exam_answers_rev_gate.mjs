// EXAM-004 gate — chốt bất biến NGUỒN cho optimistic revision (chống revert về ghi-đè-mù).
// Bổ trợ attempt_answers_rev_smoke.mjs (test hành vi lõi checkAnswersRev + repro mô phỏng).
//   node supabase/smoke/exam_answers_rev_gate.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')
let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

console.log('EXAM-004 — migration additive + helper thuần + error code:')
const mig = read('supabase/migrations/20260715000200_attempts_answers_rev.sql')
check('answers_rev additive (add column if not exists, not null default 0)',
  /add column if not exists answers_rev integer not null default 0/.test(mig))
const helper = read('lib/exam/answers-rev.ts')
check('answers-rev.ts export checkAnswersRev, thuần (không import runtime)',
  /export function checkAnswersRev/.test(helper) && !/^import /m.test(helper))
check('ERROR_CODES có ANSWERS_STALE', /ANSWERS_STALE: 'ANSWERS_STALE'/.test(read('lib/api/response.ts')))

console.log('\nEXAM-004 — autosave route (answers) guard rev:')
const auto = read('app/api/attempts/[id]/answers/route.ts')
check('BodySchema nhận expected_rev cho client mới', /expected_rev: z\.number\(\)\.int\(\)\.nonnegative\(\)\.optional\(\)/.test(auto))
check('gọi checkAnswersRev + trả ANSWERS_STALE khi lệch', /checkAnswersRev\(row\.answers_rev, expected_rev\)/.test(auto) && /fail\('ANSWERS_STALE'/.test(auto))
check('conditional update guard .eq answers_rev + bump nextRev', /\.eq\('answers_rev', row\.answers_rev\)/.test(auto) && /answers_rev: chk\.nextRev/.test(auto))
check('phân biệt 0-row: còn in_progress → STALE, ngược lại TERMINAL', /st === 'in_progress'\) return fail\('ANSWERS_STALE'/.test(auto))
check('trả answers_rev mới trong ok', /saved: true, answers_rev: chk\.nextRev/.test(auto))

console.log('\nEXAM-004 — submit route + submitAttempt guard rev:')
const submit = read('app/api/submit/route.ts')
check('SubmitBody nhận expected_rev cho client mới', /expected_rev: z\.number\(\)\.int\(\)\.nonnegative\(\)\.optional\(\)/.test(submit))
check('truyền expected_rev vào submitAttempt', /submitAttempt\(admin, parsed\.data\.attempt_id, user\.id, parsed\.data\.answers, parsed\.data\.expected_rev\)/.test(submit))
check('map ANSWERS_STALE → 409', /res\.error === 'ANSWERS_STALE'.*\n?.*fail\('ANSWERS_STALE'.*status: 409/.test(submit) || /res\.error === 'ANSWERS_STALE'/.test(submit) && /fail\('ANSWERS_STALE'[\s\S]*status: 409/.test(submit))
const att = read('lib/exam/attempt.ts')
check('ATTEMPT_COLS gồm answers_rev', /ATTEMPT_COLS[\s\S]*answers_rev'/.test(att))
check('SubmitWrap có nhánh ANSWERS_STALE', /error: 'ANSWERS_STALE'/.test(att))
check('pre-check checkAnswersRev trước khi chấm', /if \(!checkAnswersRev\(a\.answers_rev, expectedRev\)\.ok\) return \{ error: 'ANSWERS_STALE' \}/.test(att))
check('conditional update guard .eq answers_rev + bump', /\.eq\('answers_rev', a\.answers_rev\)/.test(att) && /answers_rev: a\.answers_rev \+ 1/.test(att))
check('0-row còn in_progress → ANSWERS_STALE (autosave chen)', /r\.status === 'in_progress'\) return \{ error: 'ANSWERS_STALE' \}/.test(att))
check('toAttemptDTO seed answers_rev', /answers_rev: a\.answers_rev \?\? 0/.test(att))

console.log('\nEXAM-004 — AttemptDTO type + client ExamRunner:')
check('AttemptDTO có answers_rev', /answers_rev: number/.test(read('types/exam.ts')))
const runner = read('components/exam/ExamRunner.tsx')
check('answersRevRef seed từ /start', /answersRevRef\.current = att\.answers_rev/.test(runner))
check('autosave gửi expected_rev + cập nhật rev', /expected_rev: answersRevRef\.current/.test(runner) && /answersRevRef\.current = b\.data\.answers_rev/.test(runner))
check('submit gửi expected_rev', /answers, expected_rev: answersRevRef\.current/.test(runner))
check('xử lý ANSWERS_STALE → banner tải lại (non-destructive)', /error_code === 'ANSWERS_STALE'/.test(runner) && /setStaleConflict\(true\)/.test(runner) && /location\.reload\(\)/.test(runner))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
