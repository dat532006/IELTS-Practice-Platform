// Dashboard result-history runtime smoke.
// Prereq: local Supabase + Next on SMOKE_BASE. Tạo fixture local, kiểm API thật, rồi cleanup idempotent.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
const WRITING_ID = '99999999-9999-9999-9999-999999999999'
const READING_ID = '11111111-1111-1111-1111-111111111111'

let pass = 0
let fail = 0
const check = (name, condition, extra = '') => {
  if (condition) {
    pass += 1
    console.log(`  ✅ ${name}`)
  } else {
    fail += 1
    console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`)
  }
}

function loadEnvLocal() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}

function ssrCookie(url, session) {
  const ref = new URL(url).hostname.split('.')[0]
  const name = `sb-${ref}-auth-token`
  const value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64')
  const max = 3180
  const parts = []
  if (value.length <= max) parts.push(`${name}=${value}`)
  else for (let i = 0, index = 0; i < value.length; i += max, index += 1) parts.push(`${name}.${index}=${value.slice(i, i + max)}`)
  return parts.join('; ')
}

async function createUser(url, anon, admin, email) {
  const password = 'history-pass-123'
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error || !created.data.user) throw created.error ?? new Error('create user failed')
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const signed = await client.auth.signInWithPassword({ email, password })
  if (signed.error || !signed.data.session) throw signed.error ?? new Error('sign in failed')
  return { id: created.data.user.id, cookie: ssrCookie(url, signed.data.session) }
}

async function api(path, cookie) {
  const response = await fetch(`${BASE}${path}`, { headers: cookie ? { Cookie: cookie } : {} })
  const body = await response.json().catch(() => null)
  return { status: response.status, body }
}

const criteria = { task_response: 6.5, coherence_cohesion: 6.5, lexical_resource: 6.5, grammar: 6.5 }
const taskGrade = { band: 6.5, criteria, feedback: 'Task Response 6.5: Bài đáp ứng yêu cầu.', suggestions: [] }

async function run() {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) throw new Error('Thiếu env Supabase')

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const userA = await createUser(url, anon, admin, `history-a-${runId}@test.dev`)
  const userB = await createUser(url, anon, admin, `history-b-${runId}@test.dev`)
  const attemptIds = []

  try {
    const now = Date.now()
    const fixtures = [
      { user_id: userA.id, test_id: READING_ID, status: 'submitted', band: 6, started_at: new Date(now - 2000).toISOString(), submitted_at: new Date(now - 1900).toISOString() },
      { user_id: userA.id, test_id: WRITING_ID, status: 'submitted', band: 5.5, started_at: new Date(now - 1000).toISOString(), submitted_at: new Date(now - 900).toISOString() },
      { user_id: userA.id, test_id: WRITING_ID, status: 'submitted', band: 6.5, started_at: new Date(now).toISOString(), submitted_at: new Date(now + 100).toISOString() },
    ]
    const inserted = await admin.from('attempts').insert(fixtures).select('id, test_id, band')
    if (inserted.error || !inserted.data || inserted.data.length !== 3) throw inserted.error ?? new Error('insert attempts failed')
    attemptIds.push(...inserted.data.map((row) => row.id))
    const readingAttempt = inserted.data.find((row) => row.test_id === READING_ID)
    const writingWithoutResult = inserted.data.find((row) => row.test_id === WRITING_ID && Number(row.band) === 5.5)
    const writingWithResult = inserted.data.find((row) => row.test_id === WRITING_ID && Number(row.band) === 6.5)
    if (!readingAttempt || !writingWithoutResult || !writingWithResult) throw new Error('fixture attempts not found')

    const submission = await admin.from('writing_submissions').insert({
      attempt_id: writingWithResult.id,
      user_id: userA.id,
      task1_text: 'task one',
      task2_text: 'task two',
      task1_wc: 160,
      task2_wc: 260,
      ai_score: { task1: taskGrade, task2: taskGrade, overall_band: 6.5, mock: true, graded_at: new Date(now + 100).toISOString() },
      graded_at: new Date(now + 100).toISOString(),
    })
    if (submission.error) throw submission.error

    const history = await api('/api/attempts', userA.cookie)
    const historyItems = history.body?.data?.items ?? []
    const byId = new Map(historyItems.map((item) => [item.id, item]))
    const historyDebug = JSON.stringify(historyItems)
    check('owner GET /api/attempts -> 200', history.status === 200, `got ${history.status}`)
    check('Writing đã chấm có link chi tiết', byId.get(writingWithResult.id)?.result_href === `/writing-result/${writingWithResult.id}`, historyDebug)
    check('Writing chưa có submission không tạo link giả', byId.get(writingWithoutResult.id)?.result_href === null, historyDebug)
    check('Reading terminal có link result chuẩn', byId.get(readingAttempt.id)?.result_href === `/result/${readingAttempt.id}`, historyDebug)

    const dashboard = await api('/api/dashboard', userA.cookie)
    const recent = dashboard.body?.data?.recent_attempts ?? []
    check('Dashboard recent trả link Writing chi tiết', recent.some((item) => item.id === writingWithResult.id && item.result_href === `/writing-result/${writingWithResult.id}`), JSON.stringify(recent))

    const ownResult = await api(`/api/writing-result/${writingWithResult.id}`, userA.cookie)
    const crossResult = await api(`/api/writing-result/${writingWithResult.id}`, userB.cookie)
    check('owner mở chi tiết Writing -> 200', ownResult.status === 200)
    check('user khác không mở được chi tiết -> 404', crossResult.status === 404, `got ${crossResult.status}`)

    const otherHistory = await api('/api/attempts', userB.cookie)
    const otherIds = (otherHistory.body?.data?.items ?? []).map((item) => item.id)
    check('history own-only không lộ attempt user khác', !attemptIds.some((id) => otherIds.includes(id)))
  } finally {
    if (attemptIds.length) await admin.from('writing_submissions').delete().in('attempt_id', attemptIds)
    if (attemptIds.length) await admin.from('attempts').delete().in('id', attemptIds)
    await admin.auth.admin.deleteUser(userA.id)
    await admin.auth.admin.deleteUser(userB.id)
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
  process.exitCode = fail ? 1 : 0
}

run().catch((error) => {
  console.error('SMOKE ERROR:', error)
  process.exitCode = 2
})
