// Idle-logout gate — chốt luật "treo máy quá hạn thì tự đăng xuất" bằng đồng hồ giả, không phải chờ
// 30 phút thật. Import trực tiếp production source (Node type-stripping) như logout_checked_gate.
//
// Vì sao cần gate: đây là loại tính năng HỎNG CÂM — không log, không crash, không có gì trên màn hình
//   để nhìn; tsc/lint/build vẫn xanh. Cách duy nhất biết nó còn sống là chạy đúng luật quyết định.
//   node supabase/smoke/idle_logout_gate.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  ADMIN_IDLE_LIMIT_MS,
  IDLE_CHECK_EVERY_MS,
  IDLE_EXCLUDED_PREFIXES,
  IDLE_LIMIT_MS,
  idleLimitForPath,
  isActivityAuthEvent,
  shouldIdleLogout,
} from '../../lib/auth/idle.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')
let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

const MIN = 60_000
const T0 = 1_800_000_000_000 // mốc cố định — không phụ thuộc giờ chạy
// Đăng xuất hay chưa nếu đã ngồi im `mins` phút ở `path`?
const after = (mins, path, signedIn = true) =>
  shouldIdleLogout({ signedIn, path, now: T0 + mins * MIN, lastActive: T0 })

console.log('Ngưỡng hiện hành (đổi ở lib/auth/idle.ts):')
console.log(`  toàn site = ${IDLE_LIMIT_MS / MIN} phút · /admin = ${ADMIN_IDLE_LIMIT_MS / MIN} phút · nhịp check = ${IDLE_CHECK_EVERY_MS / 1000}s`)

console.log('\n1) Ngưỡng mặc định toàn site:')
check(`ngồi im ${IDLE_LIMIT_MS / MIN - 1} phút ở /dashboard → CHƯA đăng xuất`, after(IDLE_LIMIT_MS / MIN - 1, '/dashboard') === false)
check(`đúng ${IDLE_LIMIT_MS / MIN} phút → ĐĂNG XUẤT`, after(IDLE_LIMIT_MS / MIN, '/dashboard') === true)
check('quá hạn nhiều (máy sleep 5 tiếng) → ĐĂNG XUẤT (đếm bằng timestamp, không phải setTimeout)', after(300, '/products') === true)

console.log('\n2) Khu quản trị chặt hơn:')
check(`/admin: ${ADMIN_IDLE_LIMIT_MS / MIN} phút → ĐĂNG XUẤT`, after(ADMIN_IDLE_LIMIT_MS / MIN, '/admin/tests') === true)
check(`/admin: ${ADMIN_IDLE_LIMIT_MS / MIN - 1} phút → CHƯA`, after(ADMIN_IDLE_LIMIT_MS / MIN - 1, '/admin/tests') === false)
check('cùng mốc đó ở trang thường thì CHƯA (ngưỡng admin thực sự chặt hơn)',
  ADMIN_IDLE_LIMIT_MS < IDLE_LIMIT_MS && after(ADMIN_IDLE_LIMIT_MS / MIN, '/dashboard') === false)

console.log('\n3) Guest không bao giờ bị ảnh hưởng:')
check('chưa đăng nhập + quá hạn rất lâu → KHÔNG làm gì', after(600, '/dashboard', false) === false)

console.log('\n4) Trang đang thi được loại trừ:')
for (const prefix of IDLE_EXCLUDED_PREFIXES) {
  check(`${prefix}* ngồi im 10 tiếng vẫn KHÔNG văng (đang nghe audio/đọc passage)`, after(600, `${prefix}abc`) === false)
  check(`${prefix}* → idleLimitForPath = null`, idleLimitForPath(`${prefix}abc`) === null)
}
check('rời trang thi thì lại tính bình thường', idleLimitForPath('/dashboard') === IDLE_LIMIT_MS)
check('path rỗng/null → vẫn dùng ngưỡng mặc định (không fail-open)',
  idleLimitForPath(null) === IDLE_LIMIT_MS && idleLimitForPath('') === IDLE_LIMIT_MS)

console.log('\n5) TOKEN_REFRESHED không được tính là hoạt động:')
// supabase-js tự gia hạn token ở nền (ticker 30s). Nếu tính đó là "người dùng đang dùng máy" thì mỗi
// lần gia hạn đồng hồ idle lại về 0 → JWT ngắn hơn ngưỡng idle là tính năng chết lặng.
check('TOKEN_REFRESHED → KHÔNG reset đồng hồ', isActivityAuthEvent('TOKEN_REFRESHED') === false)
check('USER_UPDATED → KHÔNG reset đồng hồ', isActivityAuthEvent('USER_UPDATED') === false)
check('SIGNED_IN → CÓ reset', isActivityAuthEvent('SIGNED_IN') === true)
check('INITIAL_SESSION (vừa mở trang) → CÓ reset', isActivityAuthEvent('INITIAL_SESSION') === true)

console.log('\n6) Đấu dây phía trình duyệt (nguồn):')
const layout = read('app/layout.tsx')
const comp = read('components/auth/IdleLogout.tsx')
check('<IdleLogout /> được gắn ở root layout (áp cho MỌI trang)',
  /<IdleLogout\s*\/>/.test(layout) && /from '@\/components\/auth\/IdleLogout'/.test(layout))
check('component dùng luật chung, không tự chép lại ngưỡng',
  /from '@\/lib\/auth\/idle'/.test(comp) && /shouldIdleLogout\(/.test(comp) && !/\d+\s*\*\s*60_000/.test(comp))
check('có interval theo nhịp chung + check lại khi tab hiện lại (tỉnh dậy từ sleep)',
  /setInterval\([\s\S]{0,40}IDLE_CHECK_EVERY_MS\)/.test(comp) && /visibilitychange/.test(comp) && /visibilityState === 'visible'/.test(comp))
check('đăng xuất qua performLogout (SEC-002 checked signOut) rồi mới điều hướng',
  /await performLogout\(\)/.test(comp) && /'\/login\?reason=idle'/.test(comp))
check('nghe đủ 5 loại tương tác, capture để bắt cả scroll trong container con',
  ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'].every((e) => comp.includes(`'${e}'`)) && /capture: true/.test(comp))
check('chia sẻ mốc hoạt động giữa các tab (SEC-003) — tab nền không văng tab đang dùng',
  /makeActivityBus/.test(comp) && /bus\.post\(now\)/.test(comp))
check('dọn listener/interval khi unmount', /clearInterval\(interval\)/.test(comp) && /removeEventListener/.test(comp))
check('/login?reason=idle có báo cho người dùng biết vì sao bị văng',
  /reason === 'idle'/.test(read('components/auth/LoginForm.tsx')))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
