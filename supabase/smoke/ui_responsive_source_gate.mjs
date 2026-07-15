// UI-RESPONSIVE source gate (UI-004) — mobile nav + no hard-min-width overflow.
// Hành vi runtime đã verify qua in-app browser: hamburger toggle aria-expanded, 6 link MAIN_NAV hiện khi
// mở, Escape đóng, nav desktop inline khi ≥768px, không tràn ngang ở các bề rộng render được. Gate này
// chốt invariant nguồn (chống revert) + tính đúng của min() cho <344px.
//   node supabase/smoke/ui_responsive_source_gate.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')
let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

console.log('UI-004 — mobile nav (Header):')
const h = read('components/layout/Header.tsx')
check('hamburger md:hidden + aria-expanded + aria-controls', /md:hidden/.test(h) && /aria-expanded=\{menuOpen\}/.test(h) && /aria-controls="mobile-nav"/.test(h))
check('panel #mobile-nav md:hidden render MAIN_NAV', /id="mobile-nav"[\s\S]*md:hidden/.test(h) && /MAIN_NAV\.map/.test(h) && (h.match(/MAIN_NAV\.map/g) || []).length >= 2)
check('Escape đóng menu', /e\.key === 'Escape'\) setMenuOpen\(false\)/.test(h))
check('link mobile onClick đóng menu', /onClick=\{\(\) => setMenuOpen\(false\)\}/.test(h))
check('nav desktop vẫn hidden md:flex (không đổi)', /className="hidden flex-1 items-center gap-\[22px\] md:flex"/.test(h))

console.log('\nUI-004 — home.css không còn min-width cứng gây tràn:')
const css = read('app/home.css')
const hardMins = (css.match(/min-width: (320px|300px|280px|200px);/g) || [])
check('không còn min-width cứng (đã bọc min(...,100%))', hardMins.length === 0, `còn: ${hardMins.join(', ')}`)
check('dùng min(Npx, 100%) cho flex child', (css.match(/min-width: min\(\d+px, 100%\)/g) || []).length >= 6)

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
