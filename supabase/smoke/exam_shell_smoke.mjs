// W5 FE smoke (server-verifiable phần) cho /exam/[id].
// Server gate: guest → redirect /login?next; authed → 200 + ExamRunner mount, KHÔNG lộ payload/đáp án trong HTML.
// ⚠️ Phần interactive (timer countdown, render passages/questions sau client-fetch, submit/auto-submit)
//    cần BROWSER (JS) — ghi blocker ở report (MCP). API start/payload/submit đã verify ở attempt_smoke (37/37).
// Usage: SMOKE_BASE=http://127.0.0.1:3100 node supabase/smoke/exam_shell_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
const FREE = '11111111-1111-1111-1111-111111111111'
const PREMIUM = '22222222-2222-2222-2222-222222222222'
const LEAK = ['answer_keys', 'Đoạn văn mẫu', 'Nội dung trả phí'] // payload/đáp án mẫu — KHÔNG được ở server HTML

let pass = 0,
  fail = 0,
  skip = 0
const results = []
const check = (n, cond, extra) =>
  cond ? (pass++, results.push(`  ✅ ${n}`)) : (fail++, results.push(`  ❌ ${n}${extra ? ' — ' + extra : ''}`))
const skipped = (n, why) => (skip++, results.push(`  ⏭️  SKIP ${n}${why ? ' — ' + why : ''}`))

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

const run = async () => {
  // 1) guest /exam/[id] → redirect /login?next (server auth gate)
  for (const [label, id] of [['free', FREE], ['premium', PREMIUM]]) {
    const r = await fetch(`${BASE}/exam/${id}`, { redirect: 'manual' })
    const loc = r.headers.get('location') || ''
    check(`guest /exam/${label} → redirect (3xx)`, r.status >= 300 && r.status < 400, `status ${r.status}`)
    check(`guest /exam/${label} → tới /login?next`, loc.includes('/login') && loc.includes('next'), loc)
  }

  // 2) authed → 200 + ExamRunner mount + KHÔNG lộ payload/đáp án trong server HTML
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) {
    skipped('authed /exam', 'thiếu env Supabase')
  } else {
    try {
      const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
      await admin.auth.admin.createUser({ email: 'w5-fe@test.dev', password: 'w5-fe-123', email_confirm: true }).catch(() => {})
      const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
      const { data, error } = await c.auth.signInWithPassword({ email: 'w5-fe@test.dev', password: 'w5-fe-123' })
      if (error || !data?.session) {
        skipped('authed /exam', 'signIn fail: ' + (error?.message ?? 'no session'))
      } else {
        const Cookie = buildSsrCookie(url, data.session)
        const r = await fetch(`${BASE}/exam/${FREE}`, { headers: { Cookie } })
        const html = await r.text()
        check('authed /exam/free → 200 (không redirect)', r.status === 200, `status ${r.status}`)
        check('authed /exam/free → ExamRunner mount', html.includes('data-testid="exam-runner"'))
        for (const k of LEAK) check(`authed /exam/free → KHÔNG lộ "${k}" trong server HTML`, !html.includes(k))
      }
    } catch (e) {
      skipped('authed /exam', 'exception: ' + (e?.message ?? String(e)))
    }
  }

  console.log(`\n=== /exam/[id] shell smoke @ ${BASE} ===`)
  console.log(results.join('\n'))
  console.log('  (interactive timer/render/submit = browser smoke — xem blocker ở W5 FE report)')
  console.log(`\nRESULT: ${pass} passed, ${fail} failed, ${skip} skipped`)
  process.exitCode = fail === 0 ? 0 : 1
}
run().catch((e) => {
  console.error('SMOKE ERROR:', e)
  process.exitCode = 2
})
