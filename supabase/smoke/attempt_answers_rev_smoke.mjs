// EXAM-004 — optimistic revision: chống tab/thiết bị CŨ đè autosave/submit của tab MỚI (mất đáp án âm thầm).
// Import helper production `checkAnswersRev` + mô phỏng conditional-write (đúng ngữ nghĩa .eq('answers_rev',cur))
// để tái hiện repro gốc và chứng minh tab cũ bị TỪ CHỐI (không mất đáp án). Pre-fix RED: module chưa tồn tại.
//   node supabase/smoke/attempt_answers_rev_smoke.mjs
import { checkAnswersRev } from '../../lib/exam/answers-rev.ts'

let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

// --- Mô hình 1 dòng attempt + conditional write giống DB (.eq status + .eq answers_rev, set rev=next) ---
function newAttempt() { return { answers: {}, answers_rev: 0, status: 'in_progress' } }
// Trả {ok, code?} — mô phỏng route: pre-check bằng helper production + guard rev khi ghi.
function write(row, answers, expectedRev, { terminal = false } = {}) {
  if (row.status !== 'in_progress') return { ok: false, code: 'ATTEMPT_TERMINAL' }
  const chk = checkAnswersRev(row.answers_rev, expectedRev)
  if (!chk.ok) return { ok: false, code: 'ANSWERS_STALE' }
  // conditional update thắng: ghi answers + bump rev (+ terminal nếu submit)
  row.answers = answers
  row.answers_rev = chk.nextRev
  if (terminal) row.status = 'submitted'
  return { ok: true, answers_rev: chk.nextRev }
}

console.log('EXAM-004 — checkAnswersRev (lõi quyết định):')
check('expected === current → ok, nextRev = current+1', (() => { const r = checkAnswersRev(3, 3); return r.ok && r.nextRev === 4 })())
check('legacy write without rev is allowed only for untouched rev 0', checkAnswersRev(0, undefined).ok)
check('legacy write without rev is stale after any write', (() => { const r = checkAnswersRev(2, undefined); return !r.ok && r.reason === 'stale' })())
check('expected < current (tab cũ) → stale', (() => { const r = checkAnswersRev(3, 0); return !r.ok && r.reason === 'stale' })())
check('expected > current (bất thường) → stale (defensive)', (() => { const r = checkAnswersRev(1, 5); return !r.ok && r.reason === 'stale' })())

console.log('\nEXAM-004 — REPRO gốc: tab B autosave đủ, tab A submit CŨ không được đè:')
{
  const row = newAttempt() // rev 0, {}
  // Tab A và Tab B cùng mở khi rev = 0.
  const revSeenByA = row.answers_rev // 0
  const revSeenByB = row.answers_rev // 0
  // Tab B autosave đủ {q1,q2,q3}
  const wB = write(row, { q1: 'cat', q2: 'dog', q3: 'sun' }, revSeenByB)
  check('tab B autosave {q1,q2,q3} thành công → rev 1', wB.ok && wB.answers_rev === 1 && row.answers_rev === 1)
  // Tab A submit STALE với rev cũ (0) và body {q1}
  const wA = write(row, { q1: 'cat' }, revSeenByA, { terminal: true })
  check('tab A submit CŨ (rev 0) bị TỪ CHỐI ANSWERS_STALE', !wA.ok && wA.code === 'ANSWERS_STALE')
  check('đáp án KHÔNG mất: vẫn {q1,q2,q3} (3 câu)', JSON.stringify(row.answers) === JSON.stringify({ q1: 'cat', q2: 'dog', q3: 'sun' }) && Object.keys(row.answers).length === 3)
  check('attempt vẫn in_progress (submit cũ không finalize)', row.status === 'in_progress')
}

console.log('\nEXAM-004 — single-tab bình thường KHÔNG regression:')
{
  const row = newAttempt()
  let rev = row.answers_rev
  const w1 = write(row, { q1: 'a' }, rev); rev = w1.answers_rev // autosave
  const w2 = write(row, { q1: 'a', q2: 'b' }, rev); rev = w2.answers_rev // autosave
  const wS = write(row, { q1: 'a', q2: 'b', q3: 'c' }, rev, { terminal: true }) // submit khớp rev
  check('chuỗi autosave→autosave→submit (rev khớp) đều thắng', w1.ok && w2.ok && wS.ok)
  check('submit ghi đáp án cuối + finalize', row.status === 'submitted' && Object.keys(row.answers).length === 3)
}

console.log('\nEXAM-004 — submit vào attempt đã terminal → chặn (idempotent an toàn):')
{
  const row = newAttempt(); write(row, { q1: 'a' }, 0, { terminal: true })
  const late = write(row, { q1: 'x' }, 1, { terminal: true })
  check('submit muộn vào attempt terminal → ATTEMPT_TERMINAL', !late.ok && late.code === 'ATTEMPT_TERMINAL')
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
