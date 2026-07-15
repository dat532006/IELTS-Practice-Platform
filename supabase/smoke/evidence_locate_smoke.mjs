// EXAM-006 — evidence locator: quote TRÙNG trong passage phải tô ĐÚNG lần xuất hiện (occurrence/context),
// và khi không khử được trùng thì KHÔNG tô (thay vì tô nhầm lần đầu như bug cũ). Import helper production
// locateQuote + normalizeEvidence. Pre-fix RED: module chưa tồn tại.
//   node supabase/smoke/evidence_locate_smoke.mjs
import { locateQuote, normalizeEvidence } from '../../lib/exam/evidence-locate.ts'

let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

// Passage có "the report" xuất hiện 3 lần ở các vị trí khác nhau.
const TEXT = 'First the report was late. Later the report improved. Finally the report was praised.'
const idxOf = (n) => { let i = -1; for (let k = 0; k < n; k++) i = TEXT.indexOf('the report', i + 1); return i }

console.log('EXAM-006 — quote DUY NHẤT → tô như cũ (không regression):')
{
  const m = locateQuote(TEXT, { quote: 'was praised' })
  check('quote duy nhất khớp đúng vị trí', m && TEXT.slice(m.start, m.end) === 'was praised')
  check('quote không có trong text → null', locateQuote(TEXT, { quote: 'not present here' }) === null)
  check('quote quá ngắn (<3) → null', locateQuote(TEXT, { quote: 'a' }) === null)
}

console.log('\nEXAM-006 — quote TRÙNG + occurrence (1-based) → đúng lần chỉ định:')
{
  const m1 = locateQuote(TEXT, { quote: 'the report', occurrence: 1 })
  const m2 = locateQuote(TEXT, { quote: 'the report', occurrence: 2 })
  const m3 = locateQuote(TEXT, { quote: 'the report', occurrence: 3 })
  check('occurrence 1 → lần đầu', m1 && m1.start === idxOf(1))
  check('occurrence 2 → lần hai', m2 && m2.start === idxOf(2))
  check('occurrence 3 → lần ba', m3 && m3.start === idxOf(3))
  check('occurrence vượt số lần → null (không tô bừa)', locateQuote(TEXT, { quote: 'the report', occurrence: 4 }) === null)
}

console.log('\nEXAM-006 — quote TRÙNG + context (khử trùng bằng đoạn trước/sau):')
{
  const mBefore = locateQuote(TEXT, { quote: 'the report', context_before: 'Later' })
  check('context_before "Later" → chọn lần 2', mBefore && mBefore.start === idxOf(2))
  const mAfter = locateQuote(TEXT, { quote: 'the report', context_after: 'was praised' })
  check('context_after "was praised" → chọn lần 3', mAfter && mAfter.start === idxOf(3))
  check('context không khớp lần nào → null', locateQuote(TEXT, { quote: 'the report', context_before: 'Nonexistent' }) === null)
}

console.log('\nEXAM-006 — quote TRÙNG + KHÔNG khử trùng → SKIP (không tô nhầm lần đầu):')
{
  check('duplicate + không occurrence/context → null (SKIP)', locateQuote(TEXT, { quote: 'the report' }) === null)
}

console.log('\nEXAM-006 — normalizeEvidence: string legacy ↔ object mới:')
{
  check('string → { quote }', (() => { const n = normalizeEvidence('some quote'); return n && n.quote === 'some quote' && n.occurrence === undefined })())
  check('object giữ occurrence/context', (() => { const n = normalizeEvidence({ quote: 'q', occurrence: 2, context_before: 'x' }); return n && n.quote === 'q' && n.occurrence === 2 && n.context_before === 'x' })())
  check('rỗng/không hợp lệ → null', normalizeEvidence(null) === null && normalizeEvidence({ quote: '' }) === null && normalizeEvidence({}) === null)
}

console.log('\nEXAM-006 — whitespace linh hoạt (xuống dòng/nhiều space) như bug fix cũ:')
{
  const t = 'alpha   the\n  report beta'
  const m = locateQuote(t, { quote: 'the report' })
  check('quote khớp qua nhiều khoảng trắng/xuống dòng', m && /the\s+report/.test(t.slice(m.start, m.end)))
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
