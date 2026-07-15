// EXAM-008 gate — review mode read-only cho câu GOM (matrix/bank/summary). Trước đây các control gom giữ
// tương tác cục bộ (picked/kéo-thả/gõ/bookmark) dù cha chặn lưu → đổi trạng thái thị giác gây hiểu lầm.
// Fix: prop readOnly (mặc định false → active mode KHÔNG đổi) khoá mọi tương tác; ExamRunner truyền
// readOnly={!!review}. Static invariant (component React — verify hành vi qua browser cần phiên review thật).
//   node supabase/smoke/exam_review_readonly_gate.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')
let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

console.log('EXAM-008 — prop readOnly + mặc định false (active KHÔNG đổi):')
const matrix = read('components/exam/questions/MatchingMatrixQuestion.tsx')
const bank = read('components/exam/questions/MatchingBankQuestion.tsx')
const summary = read('components/exam/questions/SummaryQuestion.tsx')
for (const [name, s] of [['matrix', matrix], ['bank', bank], ['summary', summary]]) {
  check(`${name}: có prop readOnly = false (mặc định)`, /readOnly = false,/.test(s) && /readOnly\?: boolean/.test(s))
}

console.log('\nEXAM-008 — khoá đổi đáp án khi review:')
check('bank: assign() return sớm khi readOnly', /const assign = [\s\S]*?if \(readOnly\) return/.test(bank))
check('summary: place() return sớm khi readOnly', /const place = [\s\S]*?if \(readOnly\) return/.test(summary))
check('matrix: cell onClick undefined + radio disabled khi readOnly', /onClick=\{readOnly \? undefined :/.test(matrix) && /disabled=\{readOnly\}/.test(matrix))

console.log('\nEXAM-008 — khoá thẻ/ô nhập/bookmark khi review:')
check('bank: chip locked = isUsed || readOnly', /const locked = isUsed \|\| readOnly/.test(bank))
check('summary: chip locked = isUsed || readOnly', /const locked = isUsed \|\| readOnly/.test(summary))
check('bank: input readOnly + drop guard', /readOnly=\{readOnly\}/.test(bank) && /onDrop=\{readOnly \? undefined :/.test(bank))
check('summary: input readOnly + drop guard', /readOnly=\{readOnly\}/.test(summary) && /onDrop=\{readOnly \? undefined :/.test(summary))
check('bank: nút bookmark ẩn khi readOnly', /\{!readOnly && \(\s*<button/.test(bank))
check('matrix: nút bookmark ẩn khi readOnly', /\{!readOnly && \(\s*<button/.test(matrix))

console.log('\nEXAM-008 — ExamRunner truyền readOnly={!!review} cho cả 3:')
const exam = read('components/exam/ExamRunner.tsx')
check('MatchingMatrixQuestion nhận readOnly={!!review}', /<MatchingMatrixQuestion[\s\S]*?readOnly=\{!!review\}[\s\S]*?\/>/.test(exam))
check('SummaryQuestion nhận readOnly={!!review}', /<SummaryQuestion[^>]*readOnly=\{!!review\}/.test(exam))
check('MatchingBankQuestion nhận readOnly={!!review}', /<MatchingBankQuestion[\s\S]*?readOnly=\{!!review\}[\s\S]*?\/>/.test(exam))
check('regular QuestionRenderer vẫn disabled={!!review} (không hồi quy)', (exam.match(/disabled=\{!!review\}/g) || []).length >= 2)

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
