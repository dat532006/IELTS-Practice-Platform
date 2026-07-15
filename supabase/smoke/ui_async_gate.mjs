// UI-ASYNC gate (UI-005 stale-response race, UI-006 honest outage, UI-007 hydration-safe countdown).
//   Phần hành vi: mô phỏng CHÍNH thuật toán reqId-guard (newest-wins) chứng minh response cũ bị bỏ.
//   Phần nguồn: chốt invariant chống revert (abort/guard ở admin list; free page phân biệt lỗi≠rỗng;
//   QR now=null tới sau mount; role=alert cho outage).
//     node supabase/smoke/ui_async_gate.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

// ---------- UI-005 hành vi: newest-wins với response đảo thứ tự ----------
console.log('UI-005 — reqId guard: response cũ KHÔNG ghi đè bộ lọc mới hơn:')
{
  let reqId = 0
  let applied = null
  const load = async (label, delayMs) => {
    const myId = ++reqId
    await sleep(delayMs)
    if (myId !== reqId) return `discarded:${label}` // đã có load mới hơn → bỏ
    applied = label
    return `applied:${label}`
  }
  // bắn "old" (chậm) trước rồi "new" (nhanh) → old resolve SAU new
  const oldP = load('old', 60)
  const newP = load('new', 10)
  const [oldR, newR] = await Promise.all([oldP, newP])
  check('load "new" được áp', newR === 'applied:new', newR)
  check('load "old" (resolve muộn) bị BỎ', oldR === 'discarded:old', oldR)
  check('state cuối = new (không bị old ghi đè)', applied === 'new', applied)
}

// ---------- UI-005 nguồn: admin list có guard + abort ----------
console.log('\nUI-005 — admin list nguồn:')
for (const f of ['components/admin/AdminUserList.tsx', 'components/admin/AdminTestList.tsx']) {
  const s = read(f)
  const name = f.split('/').pop()
  check(`${name}: reqIdRef + guard myId !== reqIdRef.current`, /reqIdRef = useRef\(0\)/.test(s) && /myId !== reqIdRef\.current\) return/.test(s))
  check(`${name}: abort request cũ + fetch signal`, /acRef\.current\?\.abort\(\)/.test(s) && /fetch\(`[^`]+`, \{ signal: ac\.signal \}\)/.test(s))
  check(`${name}: không báo lỗi khi bị chính mình hủy`, /ac\.signal\.aborted \|\| myId !== reqIdRef\.current\) return/.test(s))
}

// ---------- UI-006 nguồn: outage trung thực ----------
console.log('\nUI-006 — outage hiển thị trung thực (không giả rỗng/nuốt lỗi):')
const free = read('app/(marketing)/free/page.tsx')
check('free page phân biệt lỗi DB (failed) ≠ rỗng thật', /let failed = false/.test(free) && /if \(error\) \{\s*failed = true/.test(free) && /failed \?/.test(free))
check('free page có nút Tải lại khi sự cố', /failed \?[\s\S]*Tải lại/.test(free))
const ul = read('components/admin/AdminUserList.tsx')
check('AdminUserList: loadErr role=alert (aria-live) + không false-empty khi loading', /role="alert"/.test(ul) && /loading && items\.length === 0/.test(ul))
check('AdminTestList: loadErr role=alert', /role="alert"/.test(read('components/admin/AdminTestList.tsx')))
const vocab = read('app/(marketing)/dashboard/vocab/page.tsx')
check('vocab error role=alert + nút thử lại', /state === 'error'/.test(vocab) && /role="alert"/.test(vocab) && /thử lại/.test(vocab))
const qr = read('components/payment/TopupQrPanel.tsx')
check('QR clipboard fail KHÔNG im lặng (báo Chép tay)', /:fail/.test(qr) && /Chép tay/.test(qr))

// ---------- UI-007 nguồn: countdown hydration-safe ----------
console.log('\nUI-007 — countdown không lệch SSR/hydrate:')
check('QR now khởi tạo null (KHÔNG Date.now() lúc render)', /useState<number \| null>\(null\)/.test(qr) && !/useState\(\(\) => Date\.now\(\)\)/.test(qr))
check('QR set thời gian sau mount + tick 1s', /useEffect\(\(\) => \{\s*setNow\(Date\.now\(\)\)[\s\S]*setInterval\(\(\) => setNow\(Date\.now\(\)\), 1000\)/.test(qr))
check('secondsLeft/expired chỉ tính khi now != null', /expiresMs != null && now != null \? Math\.max/.test(qr) && /status === 'pending' && now != null &&/.test(qr))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
