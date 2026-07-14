// Ban enforcement smoke (SEC-001) — một tài khoản đã bị ban KHÔNG được chạm tới protected operations
// dù access token cũ vẫn còn hạn (~1h). Chứng minh: guard server trả 401/403 TRƯỚC business logic,
// và direct PostgREST write bị RLS chặn. Control: user KHÔNG ban vẫn qua guard bình thường.
// Prereq: Supabase local + migrations (gồm 20260714000100_ban_enforcement) + next dev/start (:3100).
//   SMOKE_BASE=http://127.0.0.1:3100 node supabase/smoke/ban_enforcement_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }
const finish = () => { console.log(`\nRESULT: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0) }

function loadEnvLocal() {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
    for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  } catch { /* optional */ }
}
function ssrCookie(url, session) {
  const ref = new URL(url).hostname.split('.')[0]
  const name = `sb-${ref}-auth-token`
  const value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64')
  const MAX = 3180, parts = []
  if (value.length <= MAX) parts.push(`${name}=${value}`)
  else for (let i = 0, idx = 0; i < value.length; i += MAX, idx++) parts.push(`${name}.${idx}=${value.slice(i, i + MAX)}`)
  return parts.join('; ')
}
async function api(method, path, cookie, payload) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })
  let body = null; try { body = await r.json() } catch { /* non-json */ }
  return { status: r.status, body }
}
const DENIED = (s) => s === 401 || s === 403
const DUMMY = '00000000-0000-0000-0000-0000000000ff'

async function makeUser(url, anon, service, email) {
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  const created = await admin.auth.admin.createUser({ email, password: 'ban-pass-123', email_confirm: true })
  if (created.error || !created.data.user) throw created.error ?? new Error('createUser failed')
  const browser = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const signed = await browser.auth.signInWithPassword({ email, password: 'ban-pass-123' })
  if (signed.error || !signed.data.session) throw signed.error ?? new Error('signIn failed')
  return { admin, id: created.data.user.id, session: signed.data.session, cookie: ssrCookie(url, signed.data.session) }
}

// Ma trận protected: mỗi route phải DENY khi user bị ban (guard TRƯỚC business logic).
async function protectedMatrix(cookie) {
  return {
    exam_start: await api('POST', `/api/exam/${DUMMY}/start`, cookie),
    submit: await api('POST', '/api/submit', cookie, { attempt_id: DUMMY, answers: {} }),
    checkout: await api('POST', '/api/checkout', cookie),
    payment_create: await api('POST', '/api/payment/create', cookie, { amount_vnd: 50000, provider: 'bank' }),
    grade_writing: await api('POST', '/api/grade-writing', cookie, { attempt_id: DUMMY, task1_text: 'x', task2_text: 'y' }),
    vocab_add: await api('POST', '/api/vocab', cookie, { term: 'ban-word' }),
    bookmark: await api('POST', '/api/bookmarks', cookie, { test_id: DUMMY, question_id: 'q1' }),
  }
}

const run = async () => {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) { console.log('SKIP: thiếu env Supabase'); return finish() }
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(url)) { console.log('SKIP: refuse non-local Supabase'); return finish() }

  const victim = await makeUser(url, anon, service, `ban-victim-${Date.now()}@test.dev`)
  const control = await makeUser(url, anon, service, `ban-control-${Date.now()}@test.dev`)
  try {
    // 1) Trước khi ban: control + victim đều qua guard (checkout tới business-layer EMPTY_CART).
    const preVictim = await api('POST', '/api/checkout', victim.cookie)
    check('pre-ban: victim qua guard (checkout != 401/403)', !DENIED(preVictim.status), `status=${preVictim.status}`)

    // 2) Ban victim (token cũ VẪN còn hạn — đây chính là lỗ hổng SEC-001).
    const ban = await victim.admin.auth.admin.updateUserById(victim.id, { ban_duration: '876000h' })
    if (ban.error) throw ban.error

    // 3) Sau ban: MỌI protected route phải DENY dù token cũ còn hạn.
    const m = await protectedMatrix(victim.cookie)
    check('banned → exam start denied', DENIED(m.exam_start.status), `status=${m.exam_start.status}`)
    check('banned → submit denied', DENIED(m.submit.status), `status=${m.submit.status}`)
    check('banned → checkout denied', DENIED(m.checkout.status), `status=${m.checkout.status}`)
    check('banned → payment create denied', DENIED(m.payment_create.status), `status=${m.payment_create.status}`)
    check('banned → grade-writing denied', DENIED(m.grade_writing.status), `status=${m.grade_writing.status}`)
    check('banned → vocab add denied', DENIED(m.vocab_add.status), `status=${m.vocab_add.status}`)
    check('banned → bookmark denied', DENIED(m.bookmark.status), `status=${m.bookmark.status}`)

    // 4) Direct PostgREST write bằng JWT cũ phải bị RLS chặn.
    const jwtClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${victim.session.access_token}` } },
    })
    const directWrite = await jwtClient.from('profiles').update({ name: 'banned-direct-write' }).eq('id', victim.id).select('id')
    const directDenied = Boolean(directWrite.error) || (directWrite.data?.length ?? 0) === 0
    check('banned → direct PostgREST profile update chặn', directDenied, `err=${directWrite.error?.code ?? 'none'} rows=${directWrite.data?.length ?? 0}`)

    // 5) Control (KHÔNG ban) vẫn qua guard bình thường.
    const cCheckout = await api('POST', '/api/checkout', control.cookie)
    check('control: checkout tới business-layer (EMPTY_CART, không bị 401/403)', cCheckout.status === 400 && cCheckout.body?.meta?.error_code === 'EMPTY_CART', `status=${cCheckout.status} code=${cCheckout.body?.meta?.error_code}`)
    const cJwt = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${control.session.access_token}` } },
    })
    const cWrite = await cJwt.from('profiles').update({ name: 'control-ok' }).eq('id', control.id).select('id')
    check('control: direct PostgREST profile update OK', !cWrite.error && (cWrite.data?.length ?? 0) === 1, `err=${cWrite.error?.code ?? 'none'}`)
  } finally {
    await victim.admin.auth.admin.deleteUser(victim.id).catch(() => {})
    await control.admin.auth.admin.deleteUser(control.id).catch(() => {})
  }
  finish()
}
run().catch((e) => { console.error(e); process.exit(1) })
