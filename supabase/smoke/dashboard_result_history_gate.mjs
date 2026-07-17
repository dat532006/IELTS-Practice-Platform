// Pure/static regression gate cho mapping lịch sử -> trang kết quả.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { attemptResultHref, attachAttemptResultHrefs } from '../../lib/dashboard/attempt-result.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
let pass = 0
let fail = 0
const check = (name, condition) => {
  condition ? (pass += 1, console.log(`  ✅ ${name}`)) : (fail += 1, console.log(`  ❌ ${name}`))
}

const writing = { id: 'w', status: 'submitted', tests: { type: 'writing' } }
const reading = { id: 'r', status: 'submitted', tests: { type: 'reading' } }
const listeningExpired = { id: 'l', status: 'expired', tests: { type: 'listening' } }
const inProgress = { id: 'p', status: 'in_progress', tests: { type: 'reading' } }

check('Writing có result -> /writing-result', attemptResultHref(writing, new Set(['w'])) === '/writing-result/w')
check('Writing thiếu result -> null', attemptResultHref(writing, new Set()) === null)
check('Reading terminal -> /result', attemptResultHref(reading, new Set()) === '/result/r')
check('Listening expired -> /result', attemptResultHref(listeningExpired, new Set()) === '/result/l')
check('attempt đang làm -> null', attemptResultHref(inProgress, new Set()) === null)
check('attach không làm mất field gốc', attachAttemptResultHrefs([{ ...writing, band: 6.5 }], new Set(['w']))[0]?.band === 6.5)

const loader = read('lib/dashboard/writing-results.ts')
const attemptsApi = read('app/api/attempts/route.ts')
const dashboardApi = read('app/api/dashboard/route.ts')
const dashboardUi = read('app/(marketing)/dashboard/page.tsx')
const historyUi = read('app/(marketing)/dashboard/history/page.tsx')

check('availability query dùng server-only module', /import 'server-only'/.test(loader))
check('availability query KHÔNG dùng service role/admin client', !/service_role|createAdminClient/.test(loader))
check('availability query khóa user_id + ai_score non-null', /\.eq\('user_id', userId\)/.test(loader) && /\.not\('ai_score', 'is', null\)/.test(loader))
check('/api/attempts attach result href server-side', /attachAttemptResultHrefs/.test(attemptsApi) && /loadWritingResultIds/.test(attemptsApi))
check('/api/dashboard attach result href server-side', /recent_attempts: attachAttemptResultHrefs/.test(dashboardApi))
check('Dashboard recent render result_href', /href=\{attempt\.result_href\}/.test(dashboardUi))
check('History desktop/mobile render result_href qua component chung', /function ResultLink/.test(historyUi) && /href=\{attempt\.result_href\}/.test(historyUi))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
