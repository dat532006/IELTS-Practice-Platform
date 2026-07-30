// Regression tripwire for the independently verified UI/UX repair set.
// Runtime geometry, keyboard and axe checks remain authoritative; this gate prevents
// the shared root-cause contracts from silently reverting.
//   node supabase/smoke/ui_verified_findings_gate.mjs
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
let passed = 0
let failed = 0

function check(name, condition) {
  if (condition) {
    passed += 1
    console.log(`  ✅ ${name}`)
  } else {
    failed += 1
    console.log(`  ❌ ${name}`)
  }
}

const globals = read('app/globals.css')
const home = read('app/home.css')
const examCss = read('app/exam.css')
const header = read('components/layout/Header.tsx')
const adminLayout = read('app/admin/layout.tsx')
const product = read('app/(marketing)/products/[slug]/page.tsx')
const landing = read('app/page.tsx')
const authLayout = read('app/(auth)/layout.tsx')
const marketingLayout = read('app/(marketing)/layout.tsx')
const exam = read('components/exam/ExamRunner.tsx')
const writing = read('components/writing/WritingRunner.tsx')
const fields = read('components/auth/fields.tsx')
const login = read('components/auth/LoginForm.tsx')
const register = read('components/auth/RegisterForm.tsx')
const catalog = read('components/product/CatalogFilters.tsx')
const pricing = read('app/(marketing)/pricing/page.tsx')
const rte = read('components/admin/RichTextEditor.tsx')
const adminForm = read('components/admin/AdminTestForm.tsx')
const legal = read('lib/legal.ts')

console.log('Canonical legal links:')
check('canonical payment-policy slug is declared', /PAYMENT_POLICY:\s*'payment-policy'/.test(legal))
check('canonical transaction-terms slug is declared', /TRANSACTION_TERMS:\s*'transaction-terms'/.test(legal))
check('Register Terms uses TRANSACTION_TERMS, never /legal/terms', /LEGAL_SLUG\.TRANSACTION_TERMS/.test(register) && !/\/legal\/terms/.test(register))

console.log('\nResponsive root-cause contracts:')
// 2026-07-30: check này đỏ từ PR #151 (đổi `xl:` → `lap:` 960px cho laptop chạy display scaling) mà
//   không ai để ý — nó khoá nguyên văn tên breakpoint thay vì khoá invariant. Invariant thật là: nav
//   desktop và menu hamburger phải bật/tắt ở CÙNG một mốc, mốc đó khai báo trong @theme của globals.css.
const navBp = (header.match(/aria-label="Điều hướng chính"[\s\S]{0,160}?\b([a-z]+):flex\b/) || [])[1]
check('marketing desktop nav + hamburger đổi trạng thái ở CÙNG breakpoint (khai báo trong @theme)',
  !!navBp && new RegExp(`\\b${navBp}:hidden\\b`).test(header) &&
  (navBp === 'sm' || navBp === 'md' || navBp === 'lg' || navBp === 'xl' || new RegExp(`--breakpoint-${navBp}:`).test(globals)),
  `breakpoint=${navBp}`)
check('marketing disclosure restores focus to its toggle', /toggleRef/.test(header) && /\.focus\(\)/.test(header))
check('admin server guard remains in server layout', /await requireAdmin\(\)/.test(adminLayout))
check('admin layout delegates only chrome to responsive AdminShell', /<AdminShell[\s\S]*email=/.test(adminLayout))
check('Exam/Writing header has a small-screen reflow contract', /@media \(max-width: 639px\)[\s\S]*\.dcx-header-inner/.test(examCss))
check('product grid main child can shrink', /className="min-w-0"/.test(product))

console.log('\nShared visual/accessibility primitives:')
check('semantic text and focus tokens exist', /--text-muted:/.test(globals) && /--text-error:/.test(globals) && /--focus-ring:/.test(globals))
check('global focus-visible replacement exists', /:focus-visible/.test(globals) && /var\(--focus-ring\)/.test(globals))
check('landing search has compound focus treatment', /search-wrap:focus-within/.test(home))
check('auth field row uses shared focus treatment class', /auth-field-control/.test(fields))

console.log('\nNames, errors and semantics:')
check('Login maps safe localized auth errors', /toAuthErrorMessage/.test(login) && !/setError\(error\.message\)/.test(login))
check('Login error is announced and associated to invalid fields', /<AuthMessage id="login-error"/.test(login) && /aria-invalid=/.test(login) && /aria-describedby=/.test(login))
check('RichTextEditor requires an accessible label', /ariaLabel:\s*string/.test(rte) && /aria-label=\{ariaLabel\}/.test(rte))
check('Admin question type select has a computed name', /aria-label=\{'Loại câu hỏi '/.test(adminForm))
// 2026-07-30: cũng đỏ từ trước — PR #127 thay <select> gốc bằng dropdown tự dựng, nhãn giờ truyền qua
//   prop `ariaLabel` rồi mới đổ vào aria-label của nút + listbox. Nhãn KHÔNG mất, chỉ là gate soi sai chỗ.
check('Catalog search and selects have stable labels',
  /htmlFor="catalog-search"/.test(catalog) && /ariaLabel="Sắp xếp bộ đề"/.test(catalog) &&
  /ariaLabel="Lọc theo độ khó"/.test(catalog) && (catalog.match(/aria-label=\{ariaLabel\}/g) || []).length >= 2)
check('Pricing amount label is programmatically associated', /htmlFor="topup-amount"/.test(pricing) && /aria-describedby="topup-amount-help"/.test(pricing))
check('landing owns main-content', /<main id="main-content"/.test(landing))
check('marketing and auth shells own main-content', /<main[\s\S]*id="main-content"/.test(marketingLayout) && /<main[\s\S]*id="main-content"/.test(authLayout))
check('active Exam and Writing states include H1 semantics', /id="exam-main-title"/.test(exam) && /id="writing-main-title"/.test(writing))
check('shared skip link is rendered by marketing and admin shells', /<SkipLink/.test(header) && /<SkipLink/.test(adminLayout))
check('route-aware nav primitive is used', /RouteNavLink/.test(header) && /RouteNavLink/.test(read('app/(marketing)/dashboard/layout.tsx')))

console.log('\nTouch and motion:')
check('password reveal has a 44px hit area', /min-h-\[44px\][^'\n]*min-w-\[44px\]/.test(fields) || /h-11[^'\n]*w-11/.test(fields))
check('RTE toolbar has a touch-viewport 44px contract', /@media \(max-width: 767px\)[\s\S]*\.admin-rte-btn[\s\S]*(min-width|width): 44px[\s\S]*height: 44px/.test(globals))
check('Exam bookmark has an expanded hit area', /\.dcx-flag\s*\{[^}]*(min-width|width): 44px[^}]*(min-height|height): 44px/.test(examCss))
check('no transition-all Tailwind shortcut remains in catalog switch', !/transition-all/.test(catalog))
check('no literal transition: all remains', !/transition:\s*all/.test(home) && !/transition:\s*all/.test(examCss))

console.log('\nAuth email validation (R01 regression guard):')
// The client-side email check must keep its escapes (`\s`, `\.`); dropping them to
// `[^s@]`/`.` silently rejects any address containing the letter "s" and blocks submit.
const forgot = read('components/auth/ForgotPasswordForm.tsx')
const CORRECT_EMAIL = '[^\\s@]+@[^\\s@]+\\.'
check('Login email regex keeps \\s/\\. escapes', login.includes(CORRECT_EMAIL) && !/\[\^s@\]/.test(login))
check('Forgot-password email regex keeps \\s/\\. escapes', forgot.includes(CORRECT_EMAIL) && !/\[\^s@\]/.test(forgot))
check('Register email regex keeps \\s/\\. escapes', register.includes(CORRECT_EMAIL) && !/\[\^s@\]/.test(register))

console.log(`\nRESULT: ${passed} passed, ${failed} failed`)
process.exitCode = failed ? 1 : 0
