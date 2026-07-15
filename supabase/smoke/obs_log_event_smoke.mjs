// DEPLOY-005 — observability: structured, redacted, correlated critical events.
// Imports the PRODUCTION helper directly (Node native TS type-strip) so the smoke fails loud if
// redaction/correlation/format ever regress. Pre-fix RED: lib/obs/log-event.ts không tồn tại → import ném.
//   node supabase/smoke/obs_log_event_smoke.mjs
import { buildEvent, formatEvent, logEvent, redactDetail } from '../../lib/obs/log-event.ts'

let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

console.log('DEPLOY-005 — buildEvent: structured shape + severity + ISO ts:')
{
  const e = buildEvent('payment.amount_mismatch', 'error', { txn: 'req_x', paid: 100, expected: 200 })
  check('event name giữ nguyên', e.event === 'payment.amount_mismatch')
  check('severity giữ nguyên', e.severity === 'error')
  check('ts là ISO', typeof e.ts === 'string' && !Number.isNaN(Date.parse(e.ts)))
  check('detail primitives giữ nguyên', e.detail.paid === 100 && e.detail.expected === 200 && e.detail.txn === 'req_x')
  check('severity lạ bị ép về error (fail-safe)', buildEvent('x', 'boom', {}).severity === 'error')
}

console.log('\nDEPLOY-005 — redaction: KHÔNG lộ secret/PII/essay/token/chữ ký:')
{
  const r = redactDetail({
    token: 'sk-live-abc', signature: 'deadbeef', password: 'hunter2', pepper: 'p',
    apiKey: 'k', api_key: 'k2', authorization: 'Bearer z', cookie: 'sid=1',
    otp: '123456', essay: 'a'.repeat(50), email: 'a@b.com', session: 's',
    txn: 'topup_1', paid: 100, ok: true,
  })
  for (const k of ['token', 'signature', 'password', 'pepper', 'apiKey', 'api_key', 'authorization', 'cookie', 'otp', 'essay', 'email', 'session']) {
    check(`key nhạy cảm "${k}" → [redacted]`, r[k] === '[redacted]', JSON.stringify(r[k]))
  }
  check('id/amount không nhạy cảm giữ nguyên', r.txn === 'topup_1' && r.paid === 100 && r.ok === true)
  // key lồng chữ nhạy cảm (case-insensitive substring)
  const r2 = redactDetail({ userToken: 't', SIGNATURE_HEX: 'x', client_secret: 's' })
  check('substring nhạy cảm (userToken/SIGNATURE_HEX/client_secret) → redacted',
    r2.userToken === '[redacted]' && r2.SIGNATURE_HEX === '[redacted]' && r2.client_secret === '[redacted]')
}

console.log('\nDEPLOY-005 — redaction: chuỗi dài bị cắt, object lồng không dump nguyên:')
{
  const long = 'x'.repeat(500)
  const r = redactDetail({ note: long, nested: { secret_inside: 'leak', a: 1 }, arr: [1, 2, 3] })
  check('chuỗi dài bị truncate (< nguyên bản)', typeof r.note === 'string' && r.note.length < long.length && /…\(500\)$/.test(r.note))
  check('object lồng KHÔNG dump giá trị con (chống rò)', !JSON.stringify(r.nested ?? '').includes('leak'))
  check('array tóm tắt độ dài, không dump phần tử thô', /array\(3\)/.test(String(r.arr)))
}

console.log('\nDEPLOY-005 — correlation: request_id đi kèm event:')
{
  const e = buildEvent('scoring.provider_error', 'error', { provider: 'anthropic', code: 'timeout' }, { request_id: 'req_corr123' })
  check('request_id có mặt trong event', e.request_id === 'req_corr123')
  check('request_id lạ bị bỏ (chỉ [\\w-])', buildEvent('x', 'info', {}, { request_id: 'bad id\ninject' }).request_id === undefined)
}

console.log('\nDEPLOY-005 — formatEvent: 1 dòng, marker OBS_EVENT, JSON parse round-trip, thứ tự key ổn định:')
{
  const e = buildEvent('storage.finalize_error', 'critical', { bucket: 'media' }, { request_id: 'req_z' })
  const line = formatEvent(e)
  check('không xuống dòng (single line)', !line.includes('\n'))
  check('có marker OBS_EVENT', line.startsWith('OBS_EVENT '))
  const parsed = JSON.parse(line.slice('OBS_EVENT '.length))
  check('parse lại được + giữ field', parsed.event === 'storage.finalize_error' && parsed.severity === 'critical' && parsed.request_id === 'req_z')
  check('thứ tự key: ts,event,severity,request_id,detail', Object.keys(parsed).join(',') === 'ts,event,severity,request_id,detail')
}

console.log('\nDEPLOY-005 — logEvent: chọn kênh theo severity + redact khi in thật:')
{
  const seen = []
  const orig = { log: console.log, warn: console.warn, error: console.error }
  console.log = (m) => seen.push(['log', m]); console.warn = (m) => seen.push(['warn', m]); console.error = (m) => seen.push(['error', m])
  try {
    logEvent('security.webhook_signature_invalid', 'warn', { provider: 'vnpay', token: 'sk-secret' })
    logEvent('payment.credit_error', 'critical', { txn: 't1' })
    logEvent('audit.info', 'info', { n: 1 })
  } finally {
    console.log = orig.log; console.warn = orig.warn; console.error = orig.error
  }
  check('warn → console.warn', seen.some(([c, m]) => c === 'warn' && String(m).includes('webhook_signature_invalid')))
  check('critical → console.error', seen.some(([c, m]) => c === 'error' && String(m).includes('payment.credit_error')))
  check('info → console.log', seen.some(([c, m]) => c === 'log' && String(m).includes('audit.info')))
  check('logEvent vẫn redact secret khi in', !seen.some(([, m]) => String(m).includes('sk-secret')))
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
