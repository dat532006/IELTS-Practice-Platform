// UI-A11Y source-invariant gate (UI-001 labels, UI-003 dialog keyboard, UI-008 reduced-motion).
// Tripwire chống revert âm thầm — hành vi runtime đã verify qua in-app browser (login label + reduced-motion
// rule served; focus-trap/Escape/restore algorithm). Ở đây chốt các invariant NGUỒN.
//   node supabase/smoke/ui_a11y_source_gate.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')
let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

console.log('UI-001 — auth input có nhãn liên kết chương trình:')
const fields = read('components/auth/fields.tsx')
check('FieldLabel render <label htmlFor> khi có htmlFor', /htmlFor \? \(\s*<label htmlFor=\{htmlFor\}/.test(fields))
check('AuthField dùng useId + input id', /useId\(\)/.test(fields) && /<input className=\{INPUT\} \{\.\.\.input\} id=\{id\}/.test(fields))
check('PasswordField input có id', /id=\{id\}\s*\/>/.test(fields) || /\{\.\.\.input\}\s*id=\{id\}/.test(fields))
check('AuthField/PasswordField nối label→id qua <FieldLabel htmlFor={id}>', (fields.match(/<FieldLabel htmlFor=\{id\}>/g) || []).length >= 2)
const login = read('components/auth/LoginForm.tsx')
check('LoginForm labelRow dạng hàm (id) => nối FieldLabel htmlFor', /labelRow=\{\(id\) =>/.test(login) && /<FieldLabel htmlFor=\{id\}>/.test(login))

console.log('\nUI-003 — dialog có focus-trap/Escape/restore:')
const dlg = read('components/a11y/A11yDialog.tsx')
check('Escape → onClose', /e\.key === 'Escape'[\s\S]*onCloseRef\.current\(\)/.test(dlg))
check('Tab trap (shiftKey wrap)', /e\.key !== 'Tab'/.test(dlg) && /e\.shiftKey/.test(dlg) && /lastEl\.focus\(\)/.test(dlg) && /firstEl\.focus\(\)/.test(dlg))
check('focus phần tử đầu khi mở', /focusables\(\)\[0\][\s\S]*first\.focus\(\)/.test(dlg))
check('restore focus về prevActive khi đóng', /prevActive && document\.contains\(prevActive\)[\s\S]*prevActive\.focus\(\)/.test(dlg))
check('container role=dialog aria-modal', /role="dialog" aria-modal="true"/.test(dlg))
const exam = read('components/exam/ExamRunner.tsx')
check('ExamRunner submit modal dùng A11yDialog + aria-labelledby', /<A11yDialog[\s\S]*labelledBy="dcx-submit-title"/.test(exam) && /id="dcx-submit-title"/.test(exam))
check('ExamRunner options + popup dùng A11yDialog', (exam.match(/<A11yDialog/g) || []).length >= 3)
const wr = read('components/writing/WritingRunner.tsx')
check('WritingRunner AI modal dùng A11yDialog', /<A11yDialog className="dcx-ai-modal"/.test(wr) && /id="dcx-ai-title"/.test(wr))

console.log('\nUI-008 — prefers-reduced-motion override:')
const css = read('app/globals.css')
check('globals.css có @media (prefers-reduced-motion: reduce)', /@media \(prefers-reduced-motion: reduce\)/.test(css))
check('tắt scroll mượt + rút animation/transition', /scroll-behavior: auto/.test(css) && /animation-duration: 0\.001ms !important/.test(css) && /transition-duration: 0\.001ms !important/.test(css))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
