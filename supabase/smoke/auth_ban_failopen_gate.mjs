// AUTH-009 gate — ban-check phải FAIL-OPEN khi RPC lỗi (thiết kế SEC-001), không được fail-closed.
//   Sự cố prod 2026-07-17 (bằng chứng sống): PGRST202 is_user_banned không tồn tại (migration
//   20260714000100 chưa push prod) + code `if (error) return null` → mọi guard coi user đã đăng nhập
//   là chưa đăng nhập → loop /login?next=/admin ↔ /admin (ERR_TOO_MANY_REDIRECTS) + mọi API authed 401.
//     node supabase/smoke/auth_ban_failopen_gate.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')
// line-comment TRƯỚC block-comment (bẫy '/*' trong comment — xem writing_authoring_gate).
const stripComments = (s) => s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

const guards = stripComments(read('lib/auth/guards.ts'))
const helper = read('lib/auth/ban-check.ts')
const login = stripComments(read('app/(auth)/login/page.tsx'))
const { banVerdict } = await import('../../lib/auth/ban-check.ts')

let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

console.log('AUTH-009 — phán quyết thuần (module PRODUCTION):')
check('banned === true → deny (ban thật vẫn bị chặn)', banVerdict(true, null) === 'deny')
check('RPC LỖI (PGRST202 thiếu hàm) → allow (fail-open — KHÔNG sập auth toàn site)',
  banVerdict(null, { code: 'PGRST202', message: 'Could not find the function' }) === 'allow')
check('banned=false, không lỗi → allow', banVerdict(false, null) === 'allow')
check('banned=null (RPC trả rỗng) → allow', banVerdict(null, null) === 'allow')
check("banned kiểu lạ ('true' string) → allow (chỉ deny khi === true tường minh)",
  banVerdict('true', null) === 'allow')
check('banned=true VÀ có lỗi → vẫn deny (deny thắng khi có bằng chứng ban)', banVerdict(true, { code: 'x' }) === 'deny')

console.log('\nAUTH-009 — guards.ts dùng phán quyết thuần, hết fail-closed:')
check('guards import banVerdict từ @/lib/auth/ban-check', /from '@\/lib\/auth\/ban-check'/.test(guards))
check('getAuthedUser gọi banVerdict', /banVerdict\(banned, error\)/.test(guards))
// CHÍNH LÀ BUG: lỗi RPC không được biến user đã đăng nhập thành null.
check("KHÔNG còn 'if (error) return null' (fail-closed) trong guards",
  !/if \(error\) return null/.test(guards))
check('vẫn chặn khi verdict deny', /=== 'deny'\) return null|'deny' === /.test(guards))

console.log('\nAUTH-009 — module thuần + các chốt liên quan không revert:')
check("ban-check.ts KHÔNG import 'server-only'", !/import 'server-only'/.test(helper))
check('ban-check.ts KHÔNG có import runtime', !/^\s*import\s/m.test(helper))
check('login page vẫn redirect user đã đăng nhập qua safeNextPath (nửa kia của loop — giữ nguyên)',
  /redirect\(safeNextPath\(raw, '\/dashboard'\)\)/.test(login))
check('requireAdmin vẫn phân biệt UNAUTHORIZED vs FORBIDDEN (403 UI không redirect)',
  /'FORBIDDEN'/.test(guards) && /'UNAUTHORIZED'/.test(guards))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
