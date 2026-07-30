// UI-RESPONSIVE source gate (UI-004) — mobile nav + no hard-min-width overflow + header không bị
// stylesheet trang chủ nuốt style.
// Hành vi runtime đã verify qua browser: hamburger toggle aria-expanded, MAIN_NAV hiện khi mở, Escape
// đóng, nav desktop inline từ breakpoint `lap` (960px), không tràn ngang ở các bề rộng render được.
// Gate này chốt invariant nguồn (chống revert).
//
// 2026-07-30 — gate từng HỎNG mà không ai biết: PR #151 đổi `xl:` → `lap:` trong Header nhưng gate vẫn
//   so khớp nguyên văn chuỗi className cũ → 2 check đỏ. Bài học: đừng khoá cả chuỗi className, chỉ khoá
//   đúng invariant (có breakpoint nào, có thuộc tính a11y nào).
//   node supabase/smoke/ui_responsive_source_gate.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')
let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

// Lấy nội dung khối `@layer <name> { ... }` bằng cách đếm ngoặc (regex không match được ngoặc lồng).
function layerBody(css, name) {
  const open = css.indexOf(`@layer ${name} {`)
  if (open < 0) return null
  let i = css.indexOf('{', open), depth = 0
  for (let j = i; j < css.length; j++) {
    if (css[j] === '{') depth++
    else if (css[j] === '}' && --depth === 0) return css.slice(i + 1, j)
  }
  return null
}

console.log('UI-004 — mobile nav (Header):')
const h = read('components/layout/Header.tsx')
const desktopNavClass = (h.match(/aria-label="Điều hướng chính"[\s\S]{0,160}?className="([^"]*)"/) || [])[1] ?? ''
const burgerClass = (h.match(/aria-controls="mobile-nav"[\s\S]{0,400}?className="([^"]*)"/) || [])[1] ?? ''
const panelClass = (h.match(/id="mobile-nav"[\s\S]{0,400}?className="([^"]*)"/) || [])[1] ?? ''

check('hamburger ẩn từ breakpoint `lap` + có ngữ nghĩa disclosure',
  /\blap:hidden\b/.test(burgerClass) && /aria-expanded=\{menuOpen\}/.test(h) && /aria-controls="mobile-nav"/.test(h), burgerClass)
check('panel #mobile-nav ẩn từ `lap` + dùng chung nguồn nav',
  /\blap:hidden\b/.test(panelClass) && /const navItems/.test(h) && /MAIN_NAV\.map/.test(h), panelClass)
check('Escape đóng menu và restore focus', /event\.key !== 'Escape'/.test(h) && /setMenuOpen\(false\)/.test(h) && /toggleRef\.current\?\.focus\(\)/.test(h))
check('link mobile onClick đóng menu', /onClick=\{\(\) => setMenuOpen\(false\)\}/.test(h))
check('nav desktop bật từ `lap` (960px), co được, KHÔNG chờ tới xl',
  /\blap:flex\b/.test(desktopNavClass) && /\bmin-w-0\b/.test(desktopNavClass) && /\bflex-1\b/.test(desktopNavClass) &&
  !/\bxl:flex\b/.test(desktopNavClass), desktopNavClass)
// 2026-07-30: nav dính vào logo rồi bỏ trống ~170px trước cụm phải (đo ở 1000px). Ô nav co giãn +
//   justify-center → dồn về giữa khi còn chỗ, tự vô hiệu khi hết chỗ nên không thêm rủi ro tràn.
check('nav desktop căn giữa phần trống thay vì dồn sát logo', /\bjustify-center\b/.test(desktopNavClass), desktopNavClass)

console.log('\nUI-004 — home.css không còn min-width cứng gây tràn:')
const css = read('app/home.css')
const hardMins = (css.match(/min-width: (320px|300px|280px|200px);/g) || [])
check('không còn min-width cứng (đã bọc min(...,100%))', hardMins.length === 0, `còn: ${hardMins.join(', ')}`)
check('dùng min(Npx, 100%) cho flex child', (css.match(/min-width: min\(\d+px, 100%\)/g) || []).length >= 6)

console.log('\nUI-004 — reset landing KHÔNG được nuốt style header dùng chung:')
// home.css không khai báo layer → unlayered, thắng mọi utility Tailwind (@layer utilities) bất kể
// specificity. Header render BÊN TRONG .dc-home ở trang chủ nên `.dc-home a/button` từng xoá màu phụ
// #564F6B, gạch chân mục đang xem và nền/viền nút hamburger — CHỈ ở trang chủ, nên rất khó phát hiện.
const base = layerBody(css, 'base')
const outsideBase = base === null ? css : css.replace(base, '')
check('có @layer base trong home.css', base !== null)
check('reset `.dc-home a` nằm TRONG @layer base', !!base && /\.dc-home a\s*\{/.test(base))
check('reset `.dc-home button` nằm TRONG @layer base', !!base && /\.dc-home button\s*\{/.test(base))
check('không còn bản unlayered của hai reset đó',
  !/\.dc-home a\s*\{/.test(outsideBase) && !/\.dc-home button\s*\{/.test(outsideBase))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
