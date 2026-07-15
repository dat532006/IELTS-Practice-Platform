// EXAM-006 gate — chốt bất biến NGUỒN cho evidence locator (chống revert về first-occurrence).
// Bổ trợ evidence_locate_smoke.mjs (hành vi locateQuote/normalizeEvidence).
//   node supabase/smoke/exam_evidence_gate.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')
let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

console.log('EXAM-006 — helper thuần locateQuote/normalizeEvidence:')
const loc = read('lib/exam/evidence-locate.ts')
check('evidence-locate.ts export locateQuote + normalizeEvidence, thuần (không import runtime)',
  /export function locateQuote/.test(loc) && /export function normalizeEvidence/.test(loc) && !/^import /m.test(loc))
check('trùng + không occurrence/context → return null (SKIP, không tô nhầm)',
  /Trùng & không có cách khử[\s\S]*return null/.test(loc))
check('ưu tiên occurrence (1-based) rồi context', /ev\.occurrence != null\) return matches\[ev\.occurrence - 1\]/.test(loc))

console.log('\nEXAM-006 — schema answer_keys nhận object evidence:')
const sr = read('lib/scoring/score-reading.ts')
// Các token dưới đây CHỈ xuất hiện trong union evidence → kiểm trực tiếp trên file (tránh slice cụt ở .optional lồng).
check('AnswerKeyEntrySchema.evidence = union(string, object{quote,occurrence,context_*})',
  /evidence:\s*z\s*\.union\(\[/.test(sr) &&
  /quote: z\.string\(\)\.min\(1\)\.max\(2000\)/.test(sr) &&
  /occurrence: z\.number\(\)\.int\(\)\.positive\(\)\.max\(50\)\.optional\(\)/.test(sr) &&
  /context_before: z\.string\(\)\.max\(200\)\.optional\(\)/.test(sr) &&
  /context_after: z\.string\(\)\.max\(200\)\.optional\(\)/.test(sr))

console.log('\nEXAM-006 — review normalize + type:')
check('buildReviewItems dùng normalizeEvidence', /normalizeEvidence\(entry\.evidence\)/.test(read('lib/exam/review.ts')))
check('ReviewItem.evidence là object {quote, occurrence?, context_*}',
  /evidence\?: \{ quote: string; occurrence\?: number; context_before\?: string; context_after\?: string \}/.test(read('types/exam.ts')))

console.log('\nEXAM-006 — rangeFromQuote dùng locateQuote (không còn first-occurrence exec):')
const ha = read('lib/exam/highlight-anchor.ts')
check('rangeFromQuote nhận descriptor + gọi locateQuote', /export function rangeFromQuote\(root: Node, ev: EvidenceDescriptor\)/.test(ha) && /locateQuote\(idx\.text, ev\)/.test(ha))
check('KHÔNG còn RegExp(...).exec(idx.text) first-occurrence trong rangeFromQuote', !/new RegExp\(pattern\)\.exec\(idx\.text\)/.test(ha))
check('EvidenceItem = EvidenceDescriptor & { number }', /export type EvidenceItem = EvidenceDescriptor & \{ number\?: number \}/.test(ha))
check('2 caller truyền cả descriptor (rangeFromQuote(root, it))', (ha.match(/rangeFromQuote\(root, it\)/g) ?? []).length === 2)

console.log('\nEXAM-006 — ExamRunner truyền descriptor + Admin authoring:')
check('ExamRunner spread it.evidence (occurrence/context)', /\.\.\.it\.evidence!/.test(read('components/exam/ExamRunner.tsx')))
const form = read('components/admin/AdminTestForm.tsx')
check('AdminTestForm có input occurrence + context_before/after',
  /evidence_occurrence/.test(form) && /evidence_context_before/.test(form) && /evidence_context_after/.test(form))
check('buildPayload: có occurrence/context → object, else string legacy',
  /const obj: EvidenceObj = \{ quote: ev\.slice\(0, 2000\) \}/.test(form) && /entry\.evidence = ev\.slice\(0, 2000\)/.test(form))
check('import hydrate evidence object → fields', /if \(typeof ev\.occurrence === 'number'\) out\.evidence_occurrence = String\(ev\.occurrence\)/.test(form))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
