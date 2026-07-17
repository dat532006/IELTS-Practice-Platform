// Static regression gate: sparse landing collections must not stretch one card across the viewport.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const page = read('app/page.tsx')
const card = read('components/landing/LandingProductCard.tsx')
const css = read('app/home-cards.css')

let passed = 0
let failed = 0
const check = (name, condition) => {
  if (condition) {
    passed += 1
    console.log(`  ✅ ${name}`)
  } else {
    failed += 1
    console.log(`  ❌ ${name}`)
  }
}

check('landing imports shared sparse-card stylesheet', /import '\.\/home-cards\.css'/.test(page))
check('card tracks have a finite 380px maximum', /minmax\(min\(100%, 280px\), 380px\)/.test(css))
check('sparse rows are centered', /\.cards-grid[\s\S]*?justify-content:\s*center/.test(css))
check('legacy unbounded 1fr rule is overridden later', page.indexOf("import './home-cards.css'") > page.indexOf("import './home.css'"))
check('Hot collections maps product thumbnail', /coverUrl:\s*p\.thumbnail_url/.test(page))
check('Free tests selects and maps cover_image', /attempts_count, cover_image/.test(page) && /coverUrl:\s*t\.cover_image/.test(page))
check('card renders uploaded cover with object-cover styling', /className="product-cover-image"/.test(card) && /object-fit:\s*cover/.test(css))
check('card has skill illustration fallback', /SkillCoverIllustration/.test(card) && /cover-illustration/.test(css))
check('title is clamped to two lines', /-webkit-line-clamp:\s*2/.test(css))
check('CTA keeps state-specific visual styles', ['free', 'locked', 'coming_soon'].every((state) => css.includes(`.product-cta.${state}`)))

console.log(`\nRESULT: ${passed} passed, ${failed} failed`)
process.exitCode = failed ? 1 : 0
