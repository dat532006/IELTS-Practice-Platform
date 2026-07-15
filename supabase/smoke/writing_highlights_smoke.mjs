// W11 Frontend smoke — Writing error-highlights anchoring (M07).
// TEST-006: KHÔNG còn COPY logic. Import & CHẠY buildSegments PRODUCTION (lib/writing/highlight-segments.ts)
//   → production đổi/hỏng thì smoke ĐỎ (không còn xanh giả). Không còn assert tautology `true`.
//   Node type-strip import trực tiếp (module PURE, chỉ import type). KHÔNG thay browser smoke (DOM/a11y).
// Usage: node supabase/smoke/writing_highlights_smoke.mjs
const { buildSegments } = await import('../../lib/writing/highlight-segments.ts')

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
  check('disjoint → mark theo thứ tự vị trí', marks(segs)[0].text === 'goverment' && marks(segs)[1].text === 'thinks')
}
// 6) Unicode/emoji — index theo UTF-16 code unit, tô đúng cụm dấu + không vỡ ký tự
{
  const U = 'Tôi thích café ☕ rất nhiều nhé.'
  const segs = buildSegments(U, [{ quote: 'café', type: 'lexical_resource', suggestion: 'coffee' }])
  check('unicode → 1 mark đúng "café"', marks(segs).length === 1 && marks(segs)[0].text === 'café')
  check('unicode → reconstruct lossless (không vỡ dấu/emoji)', reconstruct(segs) === U)
}
// 7) duplicate quote (xuất hiện 2 lần) — chỉ tô lần XUẤT HIỆN đầu (indexOf), phần sau nằm segment thường
{
  const D = 'good plan is good.'
  const segs = buildSegments(D, [{ quote: 'good', type: 'lexical_resource', suggestion: 'strong' }])
  check('duplicate → đúng 1 mark (first occurrence)', marks(segs).length === 1)
  check('duplicate → mark là "good" đầu tiên (index 0)', marks(segs)[0].text === 'good' && segs[0].hl)
  check('duplicate → reconstruct lossless (giữ "good" thứ 2)', reconstruct(segs) === D)
}
// 8) empty essay + empty highlights → 0 mark, không crash
{
  check('essay rỗng → [] (không crash)', buildSegments('', [{ quote: 'x', type: 'grammar', suggestion: 'y' }]).length === 0)
  check('highlights rỗng → 1 segment text nguyên essay', (() => { const s = buildSegments(ESSAY, []); return s.length === 1 && !s[0].hl && s[0].text === ESSAY })())
}

// 9) MUTATION GUARD — chứng minh smoke KHÔNG tautology: nếu buildSegments TRẢ SAI (ví dụ nhân đôi text),
//   assertion "reconstruct lossless" phải ĐỎ. Ở đây tạo một buildSegments đột biến cục bộ để xác nhận
//   bộ assertion phân biệt đúng/sai (guard cho chính test — không phụ thuộc production).
{
  const mutant = (essay, hls) => { const s = buildSegments(essay, hls); return [...s, { text: 'EXTRA' }] } // production + rác
  const segs = mutant(ESSAY, [{ quote: 'goverment', type: 'grammar', suggestion: 'government' }])
  check('mutation guard → reconstruct KHÁC essay khi output bị bẩn (assertion không tautology)', reconstruct(segs) !== ESSAY)
}

console.log(`\nWRITING_HIGHLIGHTS LOGIC: ${pass} passed, ${fail} failed`)
process.exitCode = fail === 0 ? 0 : 1
