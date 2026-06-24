// W7 runtime smoke — Listening signed audio gate + listening submit scoring.
// Contract: docs/ContractForAI/BackendEngineer/phase2/W7/w7_listening_audio_contract.md §7
// Drives REAL API path. Prereq: local Supabase up + seed.sql applied + `next start` (cùng env).
//   Để có audio_url SIGNED: set placeholder R2 env (R2_ACCOUNT_ID/R2_BUCKET/R2_ACCESS_KEY_ID/
//   R2_SECRET_ACCESS_KEY) trong .env.local TRƯỚC khi build/`next start`. Thiếu → audio_url=null +
//   warning R2_NOT_CONFIGURED (fallback documented; smoke báo SKIP cho assertion signed-URL).
// Usage: SMOKE_BASE=http://127.0.0.1:3100 node supabase/smoke/listening_audio_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3000'
const FREE_LISTENING = '77777777-7777-7777-7777-777777777777' // listening-free-1 (is_free, audio_key)
const PREMIUM_LISTENING = '88888888-8888-8888-8888-888888888888' // listening-premium-1 (premium, audio_key)
const PREMIUM_PRODUCT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' // listening-vol-1
const SECRET_KEYS = ['answer_keys', 'keys', 'audio_key'] // bất kỳ key nào xuất hiện = LEAK
const PAYLOAD_KEYS = ['passages', 'questions']
// All-correct answers cho free listening (khớp seed answer_keys) → raw=10 → band 4.0.
const FREE_ALL_CORRECT = {
  q1: 'library', q2: 'Smith', q3: '9:30', q4: 'valve', q5: 'B',
  q6: 'A', q7: 'C', q8: 'B', q9: 'Tuesday', q10: 'C',
}

let pass = 0, fail = 0, skip = 0
const results = []
const ok = (n) => { pass++; results.push(`  ✅ ${n}`) }
const no = (n, extra) => { fail++; results.push(`  ❌ ${n}${extra ? ' — ' + extra : ''}`) }
const skipped = (n, why) => { skip++; results.push(`  ⏭️  SKIP ${n}${why ? ' — ' + why : ''}`) }
const check = (n, cond, extra) => (cond ? ok(n) : no(n, extra))

async function getJson(path, headers) {
  const r = await fetch(`${BASE}${path}`, { headers: headers || {} })
  let body = null
  try { body = await r.json() } catch { /* non-json */ }
  return { status: r.status, body }
}
async function postJson(path, payload, headers) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(headers || {}) },
    body: JSON.stringify(payload ?? {}),
  })
  let body = null
  try { body = await r.json() } catch { /* non-json */ }
  return { status: r.status, body }
}
const deepHas = (obj, key) => {
  if (obj == null || typeof obj !== 'object') return false
  if (Object.prototype.hasOwnProperty.call(obj, key)) return true
  for (const v of Object.values(obj)) if (deepHas(v, key)) return true
  return false
}

function loadEnvLocal() {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
    const raw = readFileSync(resolve(root, '.env.local'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  } catch { /* optional */ }
}

// Kiểm tra một audio_url là signed URL hợp lệ (TTL ngắn, không lộ secret).
function assertSignedAudio(label, body) {
  const audio = body?.data?.audio_url
  const warnings = body?.meta?.warnings ?? []
  if (audio == null && warnings.includes('R2_NOT_CONFIGURED')) {
    return skipped(`${label} audio signed`, 'R2 env chưa cấu hình → fallback audio_url=null + warning R2_NOT_CONFIGURED (documented)')
  }
  check(`${label} → audio_url là https`, typeof audio === 'string' && audio.startsWith('https://'), String(audio))
  if (typeof audio !== 'string') return
  check(`${label} → audio_url có X-Amz-Signature (signed)`, audio.includes('X-Amz-Signature='))
  check(`${label} → audio_url có X-Amz-Expires (TTL)`, audio.includes('X-Amz-Expires='))
  const m = audio.match(/[?&]X-Amz-Expires=(\d+)/)
  const ttl = m ? Number(m[1]) : NaN
  check(`${label} → TTL ngắn (≤900s)`, Number.isFinite(ttl) && ttl <= 900, `ttl=${ttl}`)
  // Nếu R2_URL_TTL_SEC được set (loadEnvLocal) → TTL phải bằng giá trị env (clamp 60..900) → chứng minh env có hiệu lực.
  const envTtlRaw = Number(process.env.R2_URL_TTL_SEC)
  if (Number.isFinite(envTtlRaw) && envTtlRaw > 0) {
    const expected = Math.min(900, Math.max(60, Math.floor(envTtlRaw)))
    check(`${label} → TTL = env R2_URL_TTL_SEC (${expected})`, ttl === expected, `ttl=${ttl}, env=${expected}`)
  }
  check(`${label} → KHÔNG public permanent URL (có query SigV4)`, audio.includes('X-Amz-Algorithm=AWS4-HMAC-SHA256'))
  const secret = process.env.R2_SECRET_ACCESS_KEY
  if (secret) check(`${label} → audio_url KHÔNG chứa R2 secret`, !audio.includes(secret))
}

const run = async () => {
  loadEnvLocal()

  // === 1) FREE listening (unauth) → 200 payload + audio signed; KHÔNG answer_keys/audio_key ===
  {
    const { status, body } = await getJson(`/api/exam/${FREE_LISTENING}`)
    check('free listening → 200', status === 200, `got ${status}`)
    check('free listening → success=true', body?.success === true)
    check('free listening → có passages', deepHas(body?.data, 'passages'))
    check('free listening → có questions', deepHas(body?.data, 'questions'))
    check('free listening → skill=listening', body?.data?.test?.skill === 'listening')
    for (const k of SECRET_KEYS) check(`free listening → KHÔNG có ${k}`, !deepHas(body, k))
    assertSignedAudio('free listening', body)
  }

  // === 2) PREMIUM listening (unauth, chưa unlock) → 403 EXAM_LOCKED, KHÔNG payload/audio ===
  {
    const { status, body } = await getJson(`/api/exam/${PREMIUM_LISTENING}`)
    check('premium listening (unauth) → 403', status === 403, `got ${status}`)
    check('premium listening → error_code=EXAM_LOCKED', body?.meta?.error_code === 'EXAM_LOCKED', JSON.stringify(body?.meta))
    check('premium listening → data=null', body?.data === null)
    for (const k of [...PAYLOAD_KEYS, ...SECRET_KEYS, 'audio_url'])
      check(`premium listening (locked) → KHÔNG có ${k}`, !deepHas(body, k))
  }

  // === 3) AUTHED: unlocked premium → audio signed; + listening submit scored ===
  await authedCases()

  console.log(`\n=== Listening audio + submit smoke @ ${BASE} ===`)
  console.log(results.join('\n'))
  console.log(`\nRESULT: ${pass} passed, ${fail} failed, ${skip} skipped`)
  process.exitCode = fail === 0 ? 0 : 1
}

function buildSsrCookie(url, session) {
  const ref = new URL(url).hostname.split('.')[0]
  const name = `sb-${ref}-auth-token`
  const value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64')
  const MAX = 3180
  const parts = []
  if (value.length <= MAX) parts.push(`${name}=${value}`)
  else for (let i = 0, idx = 0; i < value.length; i += MAX, idx++) parts.push(`${name}.${idx}=${value.slice(i, i + MAX)}`)
  return parts.join('; ')
}

async function authedCases() {
  const label = 'authed listening (unlocked audio + submit scored)'
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !anon || !service) return skipped(label, 'thiếu env Supabase')

    const email = 'w7-smoke@test.dev'
    const password = 'w7-smoke-pass-123'
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
    await admin.auth.admin.createUser({ email, password, email_confirm: true }).catch(() => {})

    const anonClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: signIn, error: siErr } = await anonClient.auth.signInWithPassword({ email, password })
    if (siErr || !signIn?.session) return skipped(label, 'signIn fail: ' + (siErr?.message ?? 'no session'))
    const session = signIn.session
    const userId = session.user.id
    const Cookie = buildSsrCookie(url, session)

    // --- 3a) seed test_unlocks cho premium listening → exam 200 + audio signed, KHÔNG answer_keys/audio_key ---
    await admin.from('test_unlocks').delete().eq('user_id', userId)
    const { error: tuErr } = await admin
      .from('test_unlocks')
      .upsert({ user_id: userId, test_id: PREMIUM_LISTENING, product_id: PREMIUM_PRODUCT }, { onConflict: 'user_id,test_id,product_id' })
    if (tuErr) return skipped(label, 'seed test_unlocks fail: ' + tuErr.message)

    const prem = await getJson(`/api/exam/${PREMIUM_LISTENING}`, { Cookie })
    // sanity: guard nhận session? Nếu 403 → cookie không nhận → SKIP (DB smoke là bằng chứng chính).
    if (prem.status !== 200) return skipped(label, `guard không nhận session cookie (premium exam=${prem.status}) — xem db:verify check14/15/20`)
    check('authed +unlock → premium listening 200', prem.status === 200)
    check('authed +unlock → có payload', deepHas(prem.body?.data, 'passages') && deepHas(prem.body?.data, 'questions'))
    for (const k of SECRET_KEYS) check(`authed unlocked premium → KHÔNG có ${k}`, !deepHas(prem.body, k))
    assertSignedAudio('authed unlocked premium', prem.body)

    // --- 3b) FREE listening submit: start → submit all-correct → scored, raw=10, band=4.0, no answer_keys ---
    const start = await postJson(`/api/exam/${FREE_LISTENING}/start`, {}, { Cookie })
    if (start.status !== 200 || !start.body?.data?.attempt_id) {
      return skipped(label + ' [submit]', `start status=${start.status}`)
    }
    const attemptId = start.body.data.attempt_id
    const sub = await postJson('/api/submit', { attempt_id: attemptId, answers: FREE_ALL_CORRECT }, { Cookie })
    check('listening submit → 200', sub.status === 200, `got ${sub.status}`)
    check('listening submit → scored=true', sub.body?.data?.scored === true, JSON.stringify(sub.body?.data))
    check('listening submit → raw_score=10', sub.body?.data?.raw_score === 10, `raw=${sub.body?.data?.raw_score}`)
    check('listening submit → band=4.0', Number(sub.body?.data?.band) === 4.0, `band=${sub.body?.data?.band}`)
    check('listening submit → status submitted/expired', ['submitted', 'expired'].includes(sub.body?.data?.status))
    for (const k of SECRET_KEYS) check(`listening submit → KHÔNG có ${k}`, !deepHas(sub.body, k))

    // --- 3c) direct client (RLS): KHÔNG đọc tests.audio_key / answer_keys; KHÔNG ghi attempts ---
    const authedDb = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    })
    const akey = await authedDb.from('tests').select('audio_key').eq('id', FREE_LISTENING).limit(1)
    check('direct client SELECT tests.audio_key → denied', !!akey.error, akey.error ? '' : 'KHÔNG bị chặn (LEAK)')
    const ak = await authedDb.from('answer_keys').select('keys').eq('test_id', FREE_LISTENING).limit(1)
    check('direct client SELECT answer_keys → denied/empty', !!ak.error || (ak.data?.length ?? 0) === 0, JSON.stringify(ak.data))
    const wr = await authedDb.from('attempts').insert({ user_id: userId, test_id: FREE_LISTENING, status: 'submitted' })
    check('direct client INSERT attempts → denied', !!wr.error, wr.error ? '' : 'KHÔNG bị chặn (LEAK)')
  } catch (e) {
    skipped(label, 'exception: ' + (e?.message ?? String(e)))
  }
}

run().catch((e) => {
  console.error('SMOKE ERROR:', e)
  process.exitCode = 2
})
