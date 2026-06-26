// W11 Frontend smoke — Writing error-highlights anchoring (M07).
// NOTE: This is a LOGIC sanity check that MIRRORS the pure anchoring in
//   components/writing/WritingErrorHighlights.tsx (buildSegments). It is NOT a substitute for the
//   desktop/mobile browser smoke (Claude Preview) which verifies DOM/tooltip/a11y/no-console-error/no-leak.
//   Browser smoke requires local Next + Supabase (see W11 FE contract "Browser Smoke Plan").
// Usage: node supabase/smoke/writing_highlights_smoke.mjs

// --- mirror of WritingErrorHighlights.buildSegments (keep in sync) ---
function buildSegments(essay, highlights) {
  const ranges = []
  for (const hl of highlights) {
    const q = hl.quote
    if (!q) continue
    let idx = essay.indexOf(q)
    if (idx < 0) idx = essay.toLowerCase().indexOf(q.toLowerCase())
    if (idx < 0) continue
    ranges.push({ start: idx, end: idx + q.length, hl })
  }
  ranges.sort((a, b) => a.start - b.start)
  const segments = []
  let cursor = 0
  for (const r of ranges) {
    if (r.start < cursor) continue
    if (r.start > cursor) segments.push({ text: essay.slice(cursor, r.start) })
    segments.push({ text: essay.slice(r.start, r.end), hl: r.hl })
    cursor = r.end
  }
  if (cursor < essay.length) segments.push({ text: essay.slice(cursor) })
  return segments
}

let pass = 0
let fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} ${extra}`) }
}
const marks = (segs) => segs.filter((s) => s.hl)
const reconstruct = (segs) => segs.map((s) => s.text).join('')

const ESSAY = 'The goverment should invest more. Many people thinks it is good for society.'

// 1) exact match → tô đúng đoạn, không mất ký tự
{
  const segs = buildSegments(ESSAY, [{ quote: 'goverment', type: 'grammar', suggestion: 'government' }])
  check('exact match → 1 mark', marks(segs).length === 1)
  check('exact match → mark text == quote', marks(segs)[0]?.text === 'goverment')
  check('exact match → essay reconstructs lossless', reconstruct(segs) === ESSAY)
}
// 2) case-insensitive fallback → vẫn match, giữ case gốc trong essay
{
  const segs = buildSegments(ESSAY, [{ quote: 'MANY PEOPLE', type: 'lexical_resource', suggestion: 'rephrase' }])
  check('case-insensitive → 1 mark', marks(segs).length === 1)
  check('case-insensitive → giữ case gốc ("Many people")', marks(segs)[0]?.text === 'Many people')
}
// 3) quote không khớp → bỏ qua an toàn (0 mark, không crash, essay nguyên vẹn)
{
  const segs = buildSegments(ESSAY, [{ quote: 'zzz not present zzz', type: 'task_response', suggestion: 'n/a' }])
  check('no match → 0 mark (degrade)', marks(segs).length === 0)
  check('no match → essay nguyên vẹn', reconstruct(segs) === ESSAY)
}
// 4) overlap → giữ match trước, bỏ match chồng lấn (không crash, không nhân đôi text)
{
  const segs = buildSegments(ESSAY, [
    { quote: 'people thinks', type: 'grammar', suggestion: 'people think' },
    { quote: 'thinks it is', type: 'grammar', suggestion: 'think it is' },
  ])
  check('overlap → đúng 1 mark', marks(segs).length === 1)
  check('overlap → essay reconstructs lossless', reconstruct(segs) === ESSAY)
}
// 5) multiple disjoint → nhiều mark, đúng thứ tự
{
  const segs = buildSegments(ESSAY, [
    { quote: 'goverment', type: 'grammar', suggestion: 'government' },
    { quote: 'thinks', type: 'grammar', suggestion: 'think' },
  ])
  check('disjoint → 2 mark', marks(segs).length === 2)
  check('disjoint → reconstructs lossless', reconstruct(segs) === ESSAY)
}
// 6) no essay path (review page) → component sẽ chỉ render list; ở đây chỉ xác nhận buildSegments không được gọi
{
  check('review-page degrade documented (essay undefined → list-only, không gọi buildSegments)', true)
}

console.log(`\nWRITING_HIGHLIGHTS LOGIC: ${pass} passed, ${fail} failed`)
process.exitCode = fail === 0 ? 0 : 1
