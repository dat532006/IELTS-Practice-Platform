// Checked-logout gate (SEC-002) — runCheckedSignOut: global signOut trả {error} HOẶC throw → PHẢI
// fallback scope:'local' (xoá session cục bộ) để không kẹt cookie/redirect loop; global ok → KHÔNG gọi
// local. Import trực tiếp production (Node v24 type-stripping; performLogout dùng dynamic import nên
// không kéo browser deps).   node supabase/smoke/logout_checked_gate.mjs
import { runCheckedSignOut } from '../../lib/auth/logout.ts'

let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

function fake({ globalResult, globalThrow, localThrow } = {}) {
  const calls = []
  const signOut = async (opts) => {
    const scope = opts?.scope
    calls.push(scope)
    if (scope === 'global') {
      if (globalThrow) throw new Error('network down')
      return globalResult ?? { error: null }
    }
    if (scope === 'local') {
      if (localThrow) throw new Error('local fail')
      return { error: null }
    }
    return { error: null }
  }
  return { signOut, calls }
}

const run = async () => {
  // 1) global thành công → không fallback, KHÔNG gọi local
  {
    const f = fake({ globalResult: { error: null } })
    const r = await runCheckedSignOut(f.signOut)
    check('global ok → fellBack=false', r.fellBack === false)
    check('global ok → KHÔNG gọi local', f.calls.length === 1 && f.calls[0] === 'global', JSON.stringify(f.calls))
  }
  // 2) global trả {error} (server 500/token revoked) → fallback local
  {
    const f = fake({ globalResult: { error: { message: 'boom', status: 500 } } })
    const r = await runCheckedSignOut(f.signOut)
    check('global {error} → fellBack=true', r.fellBack === true)
    check('global {error} → gọi local fallback', f.calls.join(',') === 'global,local', JSON.stringify(f.calls))
  }
  // 3) global throw (network) → fallback local
  {
    const f = fake({ globalThrow: true })
    const r = await runCheckedSignOut(f.signOut)
    check('global throw → fellBack=true', r.fellBack === true)
    check('global throw → gọi local fallback', f.calls.join(',') === 'global,local', JSON.stringify(f.calls))
  }
  // 4) global {error} + local cũng throw → vẫn trả (không ném), fellBack=true
  {
    const f = fake({ globalResult: { error: { message: 'x' } }, localThrow: true })
    let threw = false
    let r
    try { r = await runCheckedSignOut(f.signOut) } catch { threw = true }
    check('global {error} + local throw → KHÔNG ném ra ngoài', threw === false)
    check('… fellBack=true, đã thử local', r?.fellBack === true && f.calls.join(',') === 'global,local', JSON.stringify(f.calls))
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}
run().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1) })
