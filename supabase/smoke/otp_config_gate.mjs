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

console.log('\nDEPLOY-002 — production SMTP automation contract:')
const configure = readFileSync(resolve(root, 'scripts', 'configure-auth-email.mjs'), 'utf8')
const envExample = readFileSync(resolve(root, '.env.example'), 'utf8')
const template = readFileSync(resolve(root, 'supabase', 'templates', 'confirmation.html'), 'utf8')
check('template renders the OTP token', template.includes('{{ .Token }}'))
check('Management API pins mailer_otp_length (không để dashboard trôi)',
  /mailer_otp_length: otpLength/.test(configure) && /AUTH_OTP_LENGTH/.test(configure))

// 2026-07-30 — prod gửi mã 8 số trong khi RegisterForm hard-code đúng 6 (maxLength={6} cắt mất 2 số) →
//   KHÔNG AI đăng ký được, mà tsc/lint/build vẫn xanh vì đây là lệch cấu hình runtime. Hai check dưới
//   chốt: UI nhận cả dải GoTrue cho phép (6–10) và không viết cứng số vào nội dung mail.
const registerForm = readFileSync(resolve(root, 'components', 'auth', 'RegisterForm.tsx'), 'utf8')
check('RegisterForm nhận mã 6–10 số (không hard-code đúng 6)',
  /\\d\{6,10\}/.test(registerForm) && /maxLength=\{10\}/.test(registerForm) && !/\\d\{6\}\$/.test(registerForm))
check('Nội dung mail không viết cứng độ dài mã', !/\b\d+\s*(số|chữ số|digits?)\b/i.test(
  template.replace(/<!--[\s\S]*?-->/g, '')))
check('Management API config keeps confirmation enabled and autoconfirm off',
  /external_email_enabled: true/.test(configure) && /mailer_autoconfirm: false/.test(configure))
check('SMTP, Site URL, allow-list and template are patched together',
  /smtp_host: smtpHost/.test(configure) && /site_url: siteUrl/.test(configure) &&
  /uri_allow_list:/.test(configure) && /mailer_templates_confirmation_content/.test(configure))
check('deployment secrets are documented but never NEXT_PUBLIC',
  ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_PROJECT_REF', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_ADMIN_EMAIL']
    .every((name) => envExample.includes(`${name}=`)) && !/NEXT_PUBLIC_SMTP|NEXT_PUBLIC_SUPABASE_ACCESS_TOKEN/.test(envExample))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
console.log('NOTE: production delivery still requires real SMTP credentials and a verified sender domain.')
process.exitCode = fail ? 1 : 0
