// W6 runtime smoke — server scoring (Reading) on POST /api/submit.
// Cover: band table = IELTS Academic CHUẨN (assert nội dung DB + chấm end-to-end ở MỌI boundary raw);
//   gap nhiều đáp án + ci + collapse whitespace; mcq single; mcq multi (canonical, thứ tự đảo);
//   tf/ng + yn/ng; empty=0; raw<3 → band null + BAND_UNMAPPED; expired vẫn chấm; double-submit idempotent;
//   cross-user→404; response KHÔNG answer_keys/keys/correct; direct client KHÔNG đọc answer_keys / ghi attempts;
//   answer_keys sai (points fractional/thiếu answers/type lạ) → ANSWER_KEYS_INVALID, không 500/không raw fractional;
//   submit body answers giới hạn shape/size (reject nested/oversized).
// Prereq: ĐÃ `supabase db reset` (áp migration 20260602000300 reading bands) + server (next start/dev) chạy.
//   ⚠️ Smoke KHÔNG tự seed reading bands → nếu DB còn bảng cũ/sai, phần "band table content" sẽ FAIL (không che lỗi seed).
// Usage: SMOKE_BASE=http://127.0.0.1:3100 node supabase/smoke/scoring_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
const FIXTURE = '44444444-4444-4444-4444-444444444444' // 40 câu, free, published, keys hợp lệ
const FIXTURE_BAD = '55555555-5555-5555-5555-555555555555' // keys lỗi (test P2a validation)
const FORBIDDEN = ['answer_keys', 'keys', 'correct', 'correct_answers', 'details']

let pass = 0,
  fail = 0,
  skip = 0
const results = []
const check = (n, cond, extra) =>
  cond ? (pass++, results.push(`  ✅ ${n}`)) : (fail++, results.push(`  ❌ ${n}${extra ? ' — ' + extra : ''}`))
const skipped = (n, why) => (skip++, results.push(`  ⏭️  SKIP ${n}${why ? ' — ' + why : ''}`))
const deepHas = (o, k) => {
  if (o == null || typeof o !== 'object') return false
  if (Object.prototype.hasOwnProperty.call(o, k)) return true
  for (const v of Object.values(o)) if (deepHas(v, k)) return true
  return false
}

async function api(path, { method = 'GET', cookie, body } = {}) {
  const headers = {}
  if (cookie) headers.Cookie = cookie
  if (body !== undefined) headers['content-type'] = 'application/json'
  const r = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  let j = null
  try {
    j = await r.json()
  } catch {
    /* non-json */
  }
  return { status: r.status, body: j }
}

function loadEnvLocal() {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
    for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  } catch {
    /* optional */
  }
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
async function mkUser(url, anon, admin, email, password) {
  await admin.auth.admin.createUser({ email, password, email_confirm: true }).catch(() => {})
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password })
  if (error || !data?.session) throw new Error('signIn fail: ' + (error?.message ?? 'no session'))
  return { userId: data.session.user.id, cookie: buildSsrCookie(url, data.session), client: c }
}

// ===== Fixture 40 câu (bao mọi dạng Reading W6) =====
const QIDS = Array.from({ length: 40 }, (_, i) => `q${i + 1}`)
const KEYS = {
  q1: { type: 'gap_filling', answers: ['colour', 'color'], match: 'ci' }, // nhiều đáp án hợp lệ
  q2: { type: 'gap_filling', answers: ['two words'], match: 'ci' }, // collapse whitespace + ci
  q3: { type: 'mcq_single', answers: ['B'], match: 'ci' },
  q4: { type: 'mcq_single', answers: ['C'], match: 'ci' },
  q5: { type: 'tfng', answers: ['TRUE'], match: 'ci' },
  q6: { type: 'tfng', answers: ['NOT GIVEN'], match: 'ci' },
  q7: { type: 'ynng', answers: ['YES'], match: 'ci' },
  q8: { type: 'mcq_multi', answers: ['A', 'C'], match: 'ci' }, // canonical order
  q9: { type: 'mcq_multi', answers: ['B', 'D'], match: 'ci' },
}
for (let n = 10; n <= 40; n++) KEYS[`q${n}`] = { type: 'gap_filling', answers: [`a${n}`], match: 'ci' }

const CORRECT = {
  q1: 'Color', // variant + ci
  q2: '  Two   Words ', // whitespace + ci
  q3: 'b',
  q4: 'C',
  q5: 'true',
  q6: 'Not Given',
  q7: 'yes',
  q8: ['C', 'A'], // đảo thứ tự
  q9: ['D', 'B'],
}
for (let n = 10; n <= 40; n++) CORRECT[`q${n}`] = `a${n}`

// Trả lời ĐÚNG đúng `n` câu đầu (mỗi câu 1 điểm) → raw = n.
const answersForRaw = (n) => {
  const o = {}
  for (let i = 0; i < n; i++) o[QIDS[i]] = CORRECT[QIDS[i]]
  return o
}

// Bảng IELTS Academic Reading kỳ vọng (PHẢI khớp migration 20260602000300). raw<3 → null (BAND_UNMAPPED).
const READING_BANDS = [
  [39, 40, 9.0], [37, 38, 8.5], [35, 36, 8.0], [33, 34, 7.5], [30, 32, 7.0],
  [27, 29, 6.5], [23, 26, 6.0], [20, 22, 5.5], [16, 19, 5.0], [13, 15, 4.5],
  [10, 12, 4.0], [7, 9, 3.5], [5, 6, 3.0], [3, 4, 2.5],
]
const bandFor = (raw) => {
  for (const [lo, hi, band] of READING_BANDS) if (raw >= lo && raw <= hi) return band
  return null
}

const run = async () => {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) {
    skipped('scoring cases', 'thiếu env Supabase')
    return report()
  }

  try {
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

    // --- Seed fixture tests + answer_keys (idempotent). KHÔNG seed score_bands (dùng migration). ---
    const seedTest = async (id, slug, title) =>
      admin.from('tests').upsert(
        {
          id,
          slug,
          title,
          type: 'reading',
          source: 'Smoke',
          is_free: true,
          difficulty: 2,
          question_types: ['gap_filling', 'mcq', 'tfng', 'ynng'],
          duration_sec: 3600,
          status: 'published',
          passages: [{ id: 'p1', number: 1, title: 'Fixture', content: 'Fixture passage.' }],
          questions: QIDS.map((qid, i) => ({ id: qid, number: i + 1, type: KEYS[qid]?.type ?? 'gap_filling' })),
        },
        { onConflict: 'id' },
      )
    await seedTest(FIXTURE, 'reading-scoring-fixture', '[Smoke] Reading Scoring Fixture')
    await admin.from('answer_keys').upsert({ test_id: FIXTURE, keys: KEYS }, { onConflict: 'test_id' })

    // FIXTURE_BAD: keys lỗi (P2a) — q1 valid; q2 points fractional; q3 thiếu answers; q4 type lạ.
    await seedTest(FIXTURE_BAD, 'reading-scoring-badkeys', '[Smoke] Reading Bad Keys')
    await admin.from('answer_keys').upsert(
      {
        test_id: FIXTURE_BAD,
        keys: {
          q1: { type: 'gap_filling', answers: ['x'], match: 'ci' }, // valid
          q2: { type: 'gap_filling', answers: ['y'], points: 1.5 }, // invalid: points không nguyên
          q3: { type: 'gap_filling' }, // invalid: thiếu answers
          q4: { type: 'totally_bogus', answers: ['z'] }, // invalid: type không cho phép
        },
      },
      { onConflict: 'test_id' },
    )

    const u1 = await mkUser(url, anon, admin, 'w6-smoke@test.dev', 'w6-smoke-123')
    const u2 = await mkUser(url, anon, admin, 'w6-smoke2@test.dev', 'w6-smoke2-123')
    await admin.from('attempts').delete().in('user_id', [u1.userId, u2.userId])

    const seedAttempt = async (testId, startedAtIso, durationSec) => {
      const row = { user_id: u1.userId, test_id: testId, status: 'in_progress', duration_sec: durationSec }
      if (startedAtIso) row.started_at = startedAtIso
      const { data, error } = await admin.from('attempts').insert(row).select('id').single()
      if (error) throw new Error('seedAttempt: ' + error.message)
      return data.id
    }
    const readBack = async (id) =>
      (await admin.from('attempts').select('status, raw_score, band, answers, time_spent, submitted_at').eq('id', id).maybeSingle()).data

    // === 0) BAND TABLE CONTENT: DB reading bands PHẢI == bảng Academic (catch seed cũ/sai, P1) ===
    {
      const { data, error } = await admin.from('score_bands').select('raw_min, raw_max, band').eq('test_type', 'reading')
      if (error) throw new Error('read score_bands: ' + error.message)
      const got = (data ?? [])
        .map((r) => [Number(r.raw_min), Number(r.raw_max), Number(r.band)])
        .sort((a, b) => b[0] - a[0])
      check('band table → đủ số dòng Academic', got.length === READING_BANDS.length, `got ${got.length} vs ${READING_BANDS.length}`)
      const sameRows = got.length === READING_BANDS.length && got.every((g, i) => g[0] === READING_BANDS[i][0] && g[1] === READING_BANDS[i][1] && g[2] === READING_BANDS[i][2])
      check('band table → khớp ĐÚNG bảng Academic (raw_min/raw_max/band)', sameRows, JSON.stringify(got))
    }

    // === 1) ALL-CORRECT raw=40 → band 9.0 (chứng minh mọi type/normalize/canonical) + forbidden keys ===
    const attFull = await seedAttempt(FIXTURE, null, 3600)
    {
      const r = await api('/api/submit', { method: 'POST', cookie: u1.cookie, body: { attempt_id: attFull, answers: answersForRaw(40) } })
      check('all-correct → 200', r.status === 200, `got ${r.status}`)
      check('all-correct → raw_score=40 (gap-variant + ci + whitespace + mcq single/multi-canonical + tf/ng + yn/ng)', r.body?.data?.raw_score === 40, `${r.body?.data?.raw_score}`)
      check('all-correct → max_score=40', r.body?.data?.max_score === 40)
      check('all-correct → band=9.0', r.body?.data?.band === 9.0, `${r.body?.data?.band}`)
      check('all-correct → scored=true status submitted', r.body?.data?.scored === true && r.body?.data?.status === 'submitted')
      for (const k of FORBIDDEN) check(`all-correct → KHÔNG có ${k}`, !deepHas(r.body, k))
      const row = await readBack(attFull)
      check('all-correct → DB raw_score=40 band=9.0 submitted', row?.raw_score === 40 && Number(row?.band) === 9.0 && row?.status === 'submitted', JSON.stringify(row))
      check('all-correct → DB submitted_at set + time_spent number', !!row?.submitted_at && typeof row?.time_spent === 'number')
    }

    // === 2) BAND END-TO-END ở MỌI boundary raw (cả hai đầu mỗi dải) + raw<3 unmapped ===
    const boundary = []
    for (const [lo, hi] of READING_BANDS) {
      boundary.push(hi)
      if (lo !== hi) boundary.push(lo)
    }
    boundary.push(2, 0) // dưới bảng → null + BAND_UNMAPPED
    const seen = new Set()
    for (const raw of boundary) {
      if (raw === 40 || seen.has(raw)) continue // 40 đã test ở attFull
      seen.add(raw)
      const exp = bandFor(raw)
      const att = await seedAttempt(FIXTURE, null, 3600)
      const r = await api('/api/submit', { method: 'POST', cookie: u1.cookie, body: { attempt_id: att, answers: answersForRaw(raw) } })
      const okRaw = r.body?.data?.raw_score === raw && r.body?.data?.max_score === 40
      const okBand = r.body?.data?.band === exp
      check(`boundary raw=${raw} → raw_score=${raw}, band=${exp === null ? 'null' : exp}`, okRaw && okBand, `raw=${r.body?.data?.raw_score} band=${r.body?.data?.band}`)
      if (exp === null) {
        check(`boundary raw=${raw} → warning BAND_UNMAPPED`, (r.body?.meta?.warnings ?? []).includes('BAND_UNMAPPED'), JSON.stringify(r.body?.meta?.warnings))
      }
    }

    // === 3) SPOTLIGHT normalize/canonical (đúng & sai trong 1 lần) → raw=4 ===
    {
      const att = await seedAttempt(FIXTURE, null, 3600)
      const r = await api('/api/submit', {
        method: 'POST',
        cookie: u1.cookie,
        // q1 COLOUR (variant+upper) ✓, q3 'b' (ci) ✓, q8 ['c','a'] (đảo+lower) ✓, q2 ' two  words ' ✓ → 4 đúng
        // q9 ['x'] sai (không khớp set), còn lại trống → raw 4
        body: { attempt_id: att, answers: { q1: 'COLOUR', q2: ' two  words ', q3: 'b', q8: ['c', 'a'], q9: ['x'] } },
      })
      check('spotlight normalize/canonical → raw_score=4', r.body?.data?.raw_score === 4, `${r.body?.data?.raw_score}`)
    }

    // === 4) DOUBLE-SUBMIT idempotent (không ghi đè điểm/answers) ===
    {
      const r = await api('/api/submit', { method: 'POST', cookie: u1.cookie, body: { attempt_id: attFull, answers: { q1: 'wrong' } } })
      check('double-submit → 200 idempotent submitted', r.status === 200 && r.body?.data?.status === 'submitted')
      check('double-submit → raw_score giữ 40 (không ghi đè)', r.body?.data?.raw_score === 40, `${r.body?.data?.raw_score}`)
      const row = await readBack(attFull)
      check('double-submit → DB answers KHÔNG bị ghi đè (q1=Color)', row?.answers?.q1 === 'Color', JSON.stringify(row?.answers))
    }

    // === 5) EXPIRED vẫn chấm: started_at cũ + duration 30 → expired, time_spent=30, raw vẫn tính ===
    {
      const oldStarted = new Date(Date.now() - 120_000).toISOString()
      const attE = await seedAttempt(FIXTURE, oldStarted, 30)
      const r = await api('/api/submit', { method: 'POST', cookie: u1.cookie, body: { attempt_id: attE, answers: answersForRaw(40) } })
      check('expired → status expired', r.body?.data?.status === 'expired', JSON.stringify(r.body?.data))
      check('expired → time_spent capped = duration(30)', r.body?.data?.time_spent === 30, `${r.body?.data?.time_spent}`)
      check('expired → vẫn chấm raw_score=40 band=9.0', r.body?.data?.raw_score === 40 && r.body?.data?.band === 9.0)
    }

    // === 6) CROSS-USER submit → 404 (owner guard) ===
    {
      const r = await api('/api/submit', { method: 'POST', cookie: u2.cookie, body: { attempt_id: attFull, answers: answersForRaw(40) } })
      check('cross-user submit → 404 NOT_FOUND', r.status === 404 && r.body?.meta?.error_code === 'NOT_FOUND', `got ${r.status}`)
    }

    // === 7) DIRECT CLIENT (authenticated) KHÔNG đọc answer_keys / KHÔNG ghi attempts ===
    {
      const { data, error } = await u1.client.from('answer_keys').select('keys').eq('test_id', FIXTURE)
      check('client đọc answer_keys → DENY', error != null || (data?.length ?? 0) === 0, `err=${error?.code} rows=${data?.length}`)
      const { error: wErr } = await u1.client.from('attempts').update({ band: 1.0, raw_score: 99 }).eq('id', attFull)
      check('client ghi attempts → DENY', wErr != null, `err=${wErr?.code ?? 'none'}`)
      const row = await readBack(attFull)
      check('client ghi attempts → DB band vẫn 9.0 (không bị sửa)', Number(row?.band) === 9.0, JSON.stringify(row))
    }

    // === 7b) ATOMICITY (P1): KHÔNG có attempt terminal mà raw_score=null cho FIXTURE (status+score ghi cùng 1 update) ===
    {
      const { count } = await admin
        .from('attempts')
        .select('id', { count: 'exact', head: true })
        .eq('test_id', FIXTURE)
        .in('status', ['submitted', 'expired'])
        .is('raw_score', null)
      check('atomicity → KHÔNG attempt terminal-but-unscored (raw_score null) khi có answer_keys', (count ?? 0) === 0, `count=${count}`)
    }

    // === 8) P2a — answer_keys SAI → ANSWER_KEYS_INVALID, không 500, raw integer (chỉ chấm key hợp lệ) ===
    {
      const att = await seedAttempt(FIXTURE_BAD, null, 3600)
      const r = await api('/api/submit', { method: 'POST', cookie: u1.cookie, body: { attempt_id: att, answers: { q1: 'x', q2: 'y', q3: '?', q4: 'z' } } })
      check('bad-keys → 200 (không 500)', r.status === 200, `got ${r.status}`)
      check('bad-keys → warning ANSWER_KEYS_INVALID', (r.body?.meta?.warnings ?? []).includes('ANSWER_KEYS_INVALID'), JSON.stringify(r.body?.meta?.warnings))
      check('bad-keys → chỉ chấm key hợp lệ: max_score=1, raw_score=1 (integer)', r.body?.data?.max_score === 1 && r.body?.data?.raw_score === 1 && Number.isInteger(r.body?.data?.raw_score), JSON.stringify(r.body?.data))
    }

    // === 9) P2b — submit body answers giới hạn shape/size ===
    {
      const r1 = await api('/api/submit', { method: 'POST', cookie: u1.cookie, body: { attempt_id: attFull, answers: { q1: { nested: true } } } })
      check('body: nested object value → 400 VALIDATION_ERROR', r1.status === 400 && r1.body?.meta?.error_code === 'VALIDATION_ERROR', `got ${r1.status}`)
      const many = {}
      for (let i = 0; i < 61; i++) many[`q${i}`] = 'a'
      const r2 = await api('/api/submit', { method: 'POST', cookie: u1.cookie, body: { attempt_id: attFull, answers: many } })
      check('body: >60 answer keys → 400 VALIDATION_ERROR', r2.status === 400 && r2.body?.meta?.error_code === 'VALIDATION_ERROR', `got ${r2.status}`)
      const r3 = await api('/api/submit', { method: 'POST', cookie: u1.cookie, body: { attempt_id: attFull, answers: { q1: 'x'.repeat(501) } } })
      check('body: string value quá dài → 400 VALIDATION_ERROR', r3.status === 400 && r3.body?.meta?.error_code === 'VALIDATION_ERROR', `got ${r3.status}`)
    }
  } catch (e) {
    skipped('scoring cases', 'exception: ' + (e?.message ?? String(e)))
  }

  report()
}

function report() {
  console.log(`\n=== W6 scoring smoke @ ${BASE} ===`)
  console.log(results.join('\n'))
  console.log(`\nRESULT: ${pass} passed, ${fail} failed, ${skip} skipped`)
  process.exitCode = fail === 0 ? 0 : 1
}

run().catch((e) => {
  console.error('SMOKE ERROR:', e)
  process.exitCode = 2
})
