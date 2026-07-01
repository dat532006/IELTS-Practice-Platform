// W17 runtime smoke — Dashboard · Attempts history · Vocab CRUD/export (M09).
// Prereq: Supabase local + next start (:3100). Usage: SMOKE_BASE=... node supabase/smoke/dashboard_vocab_smoke.mjs
// Kiểm: auth-gate, own-only (user khác KHÔNG thấy vocab của mình), validation, upsert idempotent, CSV export, attempts plan-gating.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

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
  const name = `sb-${ref}-auth-token`, value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64')
  const MAX = 3180, parts = []
  if (value.length <= MAX) parts.push(`${name}=${value}`)
  else for (let i = 0, idx = 0; i < value.length; i += MAX, idx++) parts.push(`${name}.${idx}=${value.slice(i, i + MAX)}`)
  return parts.join('; ')
}
async function signIn(url, anon, service, email) {
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  await admin.auth.admin.createUser({ email, password: 'w17-pass-123', email_confirm: true }).catch(() => {})
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password: 'w17-pass-123' })
  if (error || !data?.session) throw new Error('signIn fail: ' + (error?.message ?? 'no session'))
  return { admin, cookie: ssrCookie(url, data.session), id: data.session.user.id }
}
async function api(method, path, cookie, payload) {
  const r = await fetch(`${BASE}${path}`, {
    method, headers: { 'content-type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })
  const ct = r.headers.get('content-type') || ''
  let body = null
  if (ct.includes('application/json')) { try { body = await r.json() } catch { /* */ } }
  else { try { body = await r.text() } catch { /* */ } }
  return { status: r.status, body, ct }
}

const run = async () => {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) { console.log('SKIP: thiếu env Supabase'); return finish() }

  const USER = await signIn(url, anon, service, 'w17-user@test.dev')
  const USER2 = await signIn(url, anon, service, 'w17-user2@test.dev')
  const a = USER.admin
  // cleanup vocab của cả 2 user (con → không có)
  for (const u of [USER.id, USER2.id]) await a.from('vocab_log').delete().eq('user_id', u)

  // ===== AUTH GATE =====
  check('unauth GET /api/dashboard → 401', (await api('GET', '/api/dashboard', null)).status === 401)
  check('unauth GET /api/vocab → 401', (await api('GET', '/api/vocab', null)).status === 401)
  check('unauth GET /api/attempts → 401', (await api('GET', '/api/attempts', null)).status === 401)
  check('unauth GET /api/vocab/export → 401', (await api('GET', '/api/vocab/export', null)).status === 401)

  // ===== VOCAB CRUD =====
  const add = await api('POST', '/api/vocab', USER.cookie, { word: 'serendipity', definition: 'happy accident', example: 'a serendipity moment' })
  check('POST /api/vocab → 201 + item', add.status === 201 && add.body?.data?.item?.word === 'serendipity', `${add.status} ${JSON.stringify(add.body?.data)}`)
  const vid = add.body?.data?.item?.id
  check('POST word rỗng → 400 VALIDATION', (await api('POST', '/api/vocab', USER.cookie, { word: '   ' })).status === 400)

  const list1 = await api('GET', '/api/vocab', USER.cookie)
  const words1 = (list1.body?.data?.items ?? []).map((i) => i.word)
  check('GET /api/vocab chứa từ vừa thêm', words1.includes('serendipity'), words1.join(','))

  // upsert idempotent: thêm lại cùng word → KHÔNG nhân đôi
  await api('POST', '/api/vocab', USER.cookie, { word: 'serendipity', definition: 'updated def' })
  const list2 = await api('GET', '/api/vocab', USER.cookie)
  const cnt = (list2.body?.data?.items ?? []).filter((i) => i.word === 'serendipity').length
  check('upsert cùng word KHÔNG nhân đôi (=1)', cnt === 1, `count=${cnt}`)

  // OWN-ONLY: USER2 KHÔNG thấy vocab của USER
  const list2b = await api('GET', '/api/vocab', USER2.cookie)
  const words2 = (list2b.body?.data?.items ?? []).map((i) => i.word)
  check('own-only: USER2 KHÔNG thấy vocab của USER', !words2.includes('serendipity'), words2.join(','))

  // ===== EXPORT CSV =====
  const csv = await api('GET', '/api/vocab/export', USER.cookie)
  check('GET /api/vocab/export → 200 text/csv', csv.status === 200 && csv.ct.includes('text/csv'), `${csv.status} ${csv.ct}`)
  check('CSV chứa header + từ của mình', typeof csv.body === 'string' && csv.body.includes('word') && csv.body.includes('serendipity'))
  const csv2 = await api('GET', '/api/vocab/export', USER2.cookie)
  check('export own-only: CSV của USER2 KHÔNG chứa từ của USER', typeof csv2.body === 'string' && !csv2.body.includes('serendipity'))

  // ===== DELETE =====
  check('DELETE /api/vocab (id) → 200', (await api('DELETE', '/api/vocab', USER.cookie, { id: vid })).status === 200)
  const list3 = await api('GET', '/api/vocab', USER.cookie)
  check('sau xóa KHÔNG còn từ', !(list3.body?.data?.items ?? []).some((i) => i.id === vid))

  // ===== DASHBOARD =====
  const dash = await api('GET', '/api/dashboard', USER.cookie)
  check('GET /api/dashboard → 200 + stats', dash.status === 200 && typeof dash.body?.data?.stats?.vocab_count === 'number' && !!dash.body?.data?.profile?.plan, `${dash.status}`)

  // ===== ATTEMPTS HISTORY =====
  const att = await api('GET', '/api/attempts', USER.cookie)
  check('GET /api/attempts → 200 + plan + items[]', att.status === 200 && !!att.body?.data?.plan && Array.isArray(att.body?.data?.items), `${att.status}`)
  check('attempts: có cờ limited + total (server-enforced)', typeof att.body?.data?.limited === 'boolean' && typeof att.body?.data?.total === 'number')

  finish()
}
function finish() {
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
  process.exitCode = fail === 0 ? 0 : 1
}
run().catch((e) => { console.error('SMOKE ERROR:', e); process.exitCode = 2 })
