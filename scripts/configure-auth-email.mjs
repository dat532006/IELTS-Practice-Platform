import { readFile } from 'node:fs/promises'

const required = (name) => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

const accessToken = required('SUPABASE_ACCESS_TOKEN')
const projectRef = required('SUPABASE_PROJECT_REF')
const siteUrl = (process.env.AUTH_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/$/, '')
const smtpHost = required('SMTP_HOST')
const smtpPort = required('SMTP_PORT')
const smtpUser = required('SMTP_USER')
const smtpPass = required('SMTP_PASS')
const smtpAdminEmail = required('SMTP_ADMIN_EMAIL')
const smtpSenderName = required('SMTP_SENDER_NAME')

if (!/^https:\/\//.test(siteUrl)) throw new Error('AUTH_SITE_URL must be an https:// production origin')
if (!/^[a-z0-9]{20}$/i.test(projectRef)) throw new Error('SUPABASE_PROJECT_REF has an invalid shape')
if (!/^\d+$/.test(smtpPort)) throw new Error('SMTP_PORT must be numeric')
if (!smtpAdminEmail.includes('@')) throw new Error('SMTP_ADMIN_EMAIL must be an email address')

const confirmationTemplate = await readFile(new URL('../supabase/templates/confirmation.html', import.meta.url), 'utf8')
if (!confirmationTemplate.includes('{{ .Token }}')) {
  throw new Error('Confirmation template must contain {{ .Token }}')
}

const payload = {
  external_email_enabled: true,
  mailer_autoconfirm: false,
  mailer_secure_email_change_enabled: true,
  site_url: siteUrl,
  uri_allow_list: `${siteUrl},${siteUrl}/**`,
  smtp_admin_email: smtpAdminEmail,
  smtp_host: smtpHost,
  smtp_port: smtpPort,
  smtp_user: smtpUser,
  smtp_pass: smtpPass,
  smtp_sender_name: smtpSenderName,
  smtp_max_frequency: Number(process.env.SMTP_MAX_FREQUENCY_SECONDS || '60'),
  mailer_subjects_confirmation: 'Ma xac nhan dang ky IELTS Practice',
  mailer_templates_confirmation_content: confirmationTemplate,
}

const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`
const response = await fetch(endpoint, {
  method: 'PATCH',
  headers: {
    authorization: `Bearer ${accessToken}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify(payload),
})

if (!response.ok) {
  const detail = (await response.text()).slice(0, 500)
  throw new Error(`Supabase auth configuration failed (${response.status}): ${detail}`)
}

const configured = await response.json()
const checks = {
  external_email_enabled: configured.external_email_enabled === true,
  mailer_autoconfirm: configured.mailer_autoconfirm === false,
  site_url: configured.site_url === siteUrl,
  smtp_host: configured.smtp_host === smtpHost,
  smtp_admin_email: configured.smtp_admin_email === smtpAdminEmail,
  otp_template: String(configured.mailer_templates_confirmation_content || '').includes('{{ .Token }}'),
}

if (Object.values(checks).some((ok) => !ok)) {
  throw new Error(`Supabase returned an incomplete auth configuration: ${JSON.stringify(checks)}`)
}

process.stdout.write(`Supabase email OTP configured and verified for ${siteUrl}. Secrets were not printed.\n`)
