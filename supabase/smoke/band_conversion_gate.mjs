// Band conversion gate (EXAM-001 / EXAM-007 / TEST-001) — kiểm ĐỘC LẬP toàn bộ raw 3..40 cho CẢ
// Listening và Reading Academic qua production convertToBand() + score_bands DB thật. Expected là bảng
// Owner HARDCODE ĐỘC LẬP (KHÔNG sinh từ range production). Fail-closed: bất kỳ lệch nào → exit nonzero.
// Bao gồm: invalid input (âm/>40/phân số/NaN → null), loại trừ (writing/general → SCORE_BANDS_MISSING),
// và spot-check ĐƯỜNG SUBMIT THẬT cho 4 điểm đã sửa (persist band trên attempts).
//   SMOKE_BASE=http://127.0.0.1:3100 node supabase/smoke/band_conversion_gate.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { convertToBand, bandFromRows } from '../../lib/scoring/band-convert.ts'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++ } else { fail++; console.log(`  ❌ ${n} ${e}`) } }
const finish = () => { console.log(`\nRESULT: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0) }

function loadEnvLocal() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
function ssrCookie(url, session) {
  const ref = new URL(url).hostname.split('.')[0]
  const name = `sb-${ref}-auth-token`, value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64')
  const MAX = 3180, parts = []
  if (value.length <= MAX) parts.push(`${name}=${value}`)
  else for (let i = 0, idx = 0; i < value.length; i += MAX, idx++) parts.push(`${name}.${idx}=${value.slice(i, i + MAX)}`)
  return parts.join('; ')
}

// Bảng Owner ĐỘC LẬP (IELTS Academic, giống nhau cho Listening & Reading Academic). KHÔNG đọc từ DB.
function expectedBand(raw) {
  if (!Number.isInteger(raw) || raw < 3 || raw > 40) return null
  if (raw >= 39) return 9.0
  if (raw >= 37) return 8.5
  if (raw >= 35) return 8.0
  if (raw >= 33) return 7.5
  if (raw >= 30) return 7.0
  if (raw >= 27) return 6.5
  if (raw >= 23) return 6.0
  if (raw >= 20) return 5.5
  if (raw >= 16) return 5.0
  if (raw >= 13) return 4.5
  if (raw >= 10) return 4.0
  if (raw >= 7) return 3.5
  if (raw >= 5) return 3.0
  return 2.5
}

const run = async () => {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) { console.log('SKIP: thiếu env Supabase'); return finish() }
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

  // 1) FULL 3..40 × {listening, reading} qua production convertToBand vs bảng Owner độc lập.
  for (const skill of ['listening', 'reading']) {
    for (let raw = 3; raw <= 40; raw++) {
      const { band } = await convertToBand(admin, raw, skill)
      check(`${skill} raw ${raw}`, band === expectedBand(raw), `got ${band} expected ${expectedBand(raw)}`)
    }
  }

  // 2) Invalid input → null (EXAM-007). Phân số trong range KHÔNG được map.
  for (const raw of [-1, 0, 1, 2, 41, 100, 29.5, 30.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const { band } = await convertToBand(admin, raw, 'listening')
    check(`invalid raw ${raw} → null`, band === null, `got ${band}`)
  }
  check('bandFromRows(30.5) → null (integer guard)', bandFromRows(30.5, [{ raw_min: 30, raw_max: 32, band: 7 }]) === null)
  check('bandFromRows(31) → 7', bandFromRows(31, [{ raw_min: 30, raw_max: 32, band: 7 }]) === 7)

  // 3) Loại trừ Writing/General Training: enum score_band_type_t CHỈ ('reading','listening') → không thể
  //    có band table cho skill khác. Writing dùng AI grading (không qua convertToBand); reading = Academic.
  {
    const distinct = await admin.from('score_bands').select('test_type')
    const types = new Set((distinct.data ?? []).map((r) => r.test_type))
    check('score_bands chỉ reading + listening (Writing/GT loại trừ ở schema)', types.size === 2 && types.has('reading') && types.has('listening'), [...types].join(','))
  }

  // 4) Spot-check ĐƯỜNG SUBMIT THẬT: 4 điểm đã sửa của Listening + 1 control Reading (persist band).
  const runId = Date.now().toString(36)
  const email = `band-gate-${runId}@test.dev`
  const made = await admin.auth.admin.createUser({ email, password: 'band-pass-123', email_confirm: true })
  const userId = made.data.user.id
  const cli = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const signed = await cli.auth.signInWithPassword({ email, password: 'band-pass-123' })
  const cookie = ssrCookie(url, signed.data.session)
  const testIds = []
  const attemptIds = []
  try {
    // Tạo 1 test 40 câu gap_filling (is_free) cho mỗi (skill, K) rồi submit đúng K câu → raw=K.
    const cases = [
      ['listening', 18, 5.0], ['listening', 19, 5.0], ['listening', 26, 6.0], ['listening', 32, 7.0],
      ['reading', 18, 5.0],
    ]
    for (const [skill, K, wantBand] of cases) {
      const questions = Array.from({ length: 40 }, (_, i) => ({ id: `q${i + 1}`, number: i + 1, type: 'gap_filling', points: 1 }))
      const answer_keys = {}
      for (let i = 1; i <= 40; i++) answer_keys[`q${i}`] = { type: 'gap_filling', answers: [`w${i}`], match: 'exact', points: 1 }
      const t = await admin.from('tests').insert({
        slug: `band-gate-${skill}-${K}-${runId}`, title: `band gate ${skill} ${K}`, type: skill, is_free: true, status: 'published',
        passages: [{ id: 'p1', number: 1, title: 'P', content: 'x' }], questions,
      }).select('id').single()
      testIds.push(t.data.id)
      await admin.from('answer_keys').insert({ test_id: t.data.id, keys: answer_keys })

      const start = await fetch(`${BASE}/api/exam/${t.data.id}/start`, { method: 'POST', headers: { Cookie: cookie } })
      const attempt = (await start.json())?.data
      const attemptId = attempt?.attempt_id
      attemptIds.push(attemptId)
      const answers = {}
      for (let i = 1; i <= 40; i++) answers[`q${i}`] = i <= K ? `w${i}` : 'zzz'
      const sub = await fetch(`${BASE}/api/submit`, {
        method: 'POST', headers: { 'content-type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ attempt_id: attemptId, answers }),
      })
      check(`submit ${skill} K=${K} → 200`, sub.status === 200, `status=${sub.status}`)
      const row = await admin.from('attempts').select('raw_score, band').eq('id', attemptId).single()
      check(`submit ${skill} raw=${K} → raw_score=${K}`, row.data?.raw_score === K, `got ${row.data?.raw_score}`)
      check(`submit ${skill} raw=${K} → persist band=${wantBand}`, Number(row.data?.band) === wantBand, `got ${row.data?.band}`)
    }
  } finally {
    for (const aid of attemptIds) if (aid) await admin.from('attempts').delete().eq('id', aid)
    for (const tid of testIds) { await admin.from('answer_keys').delete().eq('test_id', tid); await admin.from('tests').delete().eq('id', tid) }
    await admin.auth.admin.deleteUser(userId).catch(() => {})
  }
  finish()
}
run().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1) })
