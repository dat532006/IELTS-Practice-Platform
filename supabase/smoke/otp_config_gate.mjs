// DEPLOY-002 gate — LOCAL OTP readiness khớp cấu hình (không overclaim). Trước đây runbook nói "local
//   OTP sẵn sàng" nhưng [inbucket] enabled=false → signup local KHÔNG bắt được mail OTP. Gate đọc
//   supabase/config.toml (section-aware) và chốt: inbucket bật + enable_signup + enable_confirmations +
//   otp_length=6 + otp_expiry. Prod SMTP/template/Site URL = Owner (dashboard) — NGOÀI phạm vi gate này.
//     node supabase/smoke/otp_config_gate.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const toml = readFileSync(resolve(root, 'supabase', 'config.toml'), 'utf8')
let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

// Parser TOML tối giản, section-aware: trả value (string) của key trong section cho trước.
function get(section, key) {
  const lines = toml.split(/\r?\n/)
  let cur = null
  for (const raw of lines) {
    const line = raw.replace(/\s+#.*$/, '').trim()
    const sec = line.match(/^\[([^\]]+)\]$/)
    if (sec) { cur = sec[1]; continue }
    if (cur !== section) continue
    const kv = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/)
    if (kv && kv[1] === key) return kv[2].replace(/^["']|["']$/g, '')
  }
  return undefined
}

console.log('DEPLOY-002 — LOCAL OTP config khớp claim "sẵn sàng":')
check('[inbucket] enabled = true (mail catcher bật)', get('inbucket', 'enabled') === 'true', `got ${get('inbucket', 'enabled')}`)
check('[auth] enable_signup = true', get('auth', 'enable_signup') === 'true', `got ${get('auth', 'enable_signup')}`)
check('[auth.email] enable_confirmations = true (OTP xác nhận)', get('auth.email', 'enable_confirmations') === 'true', `got ${get('auth.email', 'enable_confirmations')}`)
check('[auth.email] otp_length = 6', get('auth.email', 'otp_length') === '6', `got ${get('auth.email', 'otp_length')}`)
check('[auth.email] otp_expiry đặt (giây)', /^\d+$/.test(get('auth.email', 'otp_expiry') ?? ''), `got ${get('auth.email', 'otp_expiry')}`)

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
console.log('NOTE: E2E signup→mail→OTP cần `supabase start` (nay đã bật inbucket). Prod SMTP/template/Site URL = Owner dashboard.')
process.exitCode = fail ? 1 : 0
