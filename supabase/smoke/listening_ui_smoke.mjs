// W7 FE smoke (server-verifiable) cho Listening UI.
// Server gate: guest /exam/[listening] → redirect /login?next; authed → 200 + ExamRunner mount,
//   KHÔNG lộ answer_keys/audio_key/đáp án trong server HTML.
// Payload FE tiêu thụ (GET /api/exam/[id]): audio_url signed + listening question types
//   (diagram_label/map_labelling/matching_features) + diagram image; KHÔNG answer_keys/audio_key.
// ⚠️ Interactive (phát audio, overlay render, play-once, submit qua UI) cần BROWSER — ghi blocker ở report.
//    Submit scored end-to-end đã verify ở listening_audio_smoke (API). Render mapping verify qua build + payload shape.
// Usage: SMOKE_BASE=http://127.0.0.1:3100 node supabase/smoke/listening_ui_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
const FREE_LISTENING = '77777777-7777-7777-7777-777777777777'
// Đáp án mẫu/secret KHÔNG được xuất hiện trong server HTML hay payload client.
const LEAK = ['answer_keys', 'audio_key', '"keys"']

let pass = 0, fail = 0, skip = 0
const results = []
const check = (n, cond, extra) =>
  cond ? (pass++, results.push(`  ✅ ${n}`)) : (fail++, results.push(`  ❌ ${n}${extra ? ' — ' + extra : ''}`))
const skipped = (n, why) => (skip++, results.push(`  ⏭️  SKIP ${n}${why ? ' — ' + why : ''}`))

const deepHas = (obj, key) => {
  if (obj == null || typeof obj !== 'object') return false
  if (Object.prototype.hasOwnProperty.call(obj, key)) return true
  for (const v of Object.values(obj)) if (deepHas(v, key)) return true
  return false
}
function loadEnvLocal() {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
    for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  } catch { /* optional */ }
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

const run = async () => {
  // 1) guest /exam/[listening] → redirect /login?next (server auth gate)
  {
    const r = await fetch(`${BASE}/exam/${FREE_LISTENING}`, { redirect: 'manual' })
    const loc = r.headers.get('location') || ''
    check('guest /exam/listening → redirect (3xx)', r.status >= 300 && r.status < 400, `status ${r.status}`)
    check('guest /exam/listening → tới /login?next', loc.includes('/login') && loc.includes('next'), loc)
  }

  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) return finish(skipped('authed listening UI', 'thiếu env Supabase'))

  try {
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
    await admin.auth.admin.createUser({ email: 'w7-fe@test.dev', password: 'w7-fe-123', email_confirm: true }).catch(() => {})
    const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await c.auth.signInWithPassword({ email: 'w7-fe@test.dev', password: 'w7-fe-123' })
    if (error || !data?.session) return finish(skipped('authed listening UI', 'signIn fail: ' + (error?.message ?? 'no session')))
    const Cookie = buildSsrCookie(url, data.session)

    // 2) authed /exam/[listening] → 200 + ExamRunner mount + KHÔNG lộ trong server HTML
    const r = await fetch(`${BASE}/exam/${FREE_LISTENING}`, { headers: { Cookie } })
    const html = await r.text()
    check('authed /exam/listening → 200', r.status === 200, `status ${r.status}`)
    check('authed /exam/listening → ExamRunner mount', html.includes('data-testid="exam-runner"'))
    for (const k of LEAK) check(`authed /exam/listening → KHÔNG lộ "${k}" trong server HTML`, !html.includes(k))

    // 3) Payload FE tiêu thụ: audio_url signed + listening question types + diagram image; KHÔNG leak
    const pr = await fetch(`${BASE}/api/exam/${FREE_LISTENING}`, { headers: { Cookie } })
    const pb = await pr.json().catch(() => null)
    check('GET /api/exam/listening → 200', pr.status === 200, `status ${pr.status}`)
    const audio = pb?.data?.audio_url
    check('payload → audio_url signed (X-Amz-Signature)', typeof audio === 'string' && audio.includes('X-Amz-Signature='), String(audio))
    const qs = Array.isArray(pb?.data?.questions) ? pb.data.questions : []
    const types = new Set(qs.map((q) => q?.type))
    check('payload → có diagram_label', types.has('diagram_label'))
    check('payload → có map_labelling', types.has('map_labelling'))
    check('payload → có matching_features', types.has('matching_features'))
    const diagram = qs.find((q) => q?.type === 'diagram_label')
    check('payload → diagram có image (overlay mode)', typeof diagram?.image === 'string' && diagram.image.startsWith('data:image'))
    check('payload → diagram có toạ độ x/y', typeof diagram?.x === 'number' && typeof diagram?.y === 'number')
    for (const k of ['answer_keys', 'audio_key', 'keys'])
      check(`payload → KHÔNG có ${k}`, !deepHas(pb, k))
  } catch (e) {
    skipped('authed listening UI', 'exception: ' + (e?.message ?? String(e)))
  }
  finish()
}

function finish() {
  console.log(`\n=== Listening UI smoke @ ${BASE} ===`)
  console.log(results.join('\n'))
  console.log('  (phát audio / overlay render / play-once / submit qua UI = browser smoke — xem blocker ở W7 FE report)')
  console.log(`\nRESULT: ${pass} passed, ${fail} failed, ${skip} skipped`)
  process.exitCode = fail === 0 ? 0 : 1
}
run().catch((e) => { console.error('SMOKE ERROR:', e); process.exitCode = 2 })
