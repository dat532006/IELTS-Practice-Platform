// FB-01 smoke — word-diff cho card "Lỗi & gợi ý sửa" (lib/writing/word-diff.ts).
//   Import & CHẠY module PRODUCTION (TEST-006 pattern — không mirror logic). Node type-strip
//   import trực tiếp được (module PURE, không import). Hermetic: không cần app/DB/env.
//     node supabase/smoke/writing_word_diff_smoke.mjs
const { diffWords, hasUsefulFix } = await import('../../lib/writing/word-diff.ts')

let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }
const joinSide = (tokens) => tokens.map((t) => t.text).join(' ')
const ops = (tokens) => tokens.map((t) => t.op).join(',')

// 1) thay 1 từ giữa câu — chỉ từ đó bị del/ins, phần còn lại same
{
  const { before, after } = diffWords('Japan led the pack in this category', 'Japan topped the pack in this category')
  check('thay 1 từ → before có đúng 1 del', before.filter((t) => t.op === 'del').length === 1)
  check('thay 1 từ → after có đúng 1 ins ("topped")', after.filter((t) => t.op === 'ins').map((t) => t.text).join() === 'topped')
  check('reconstruct before lossless', joinSide(before) === 'Japan led the pack in this category')
  check('reconstruct after lossless', joinSide(after) === 'Japan topped the pack in this category')
}
// 2) xóa cụm từ (informal emphasis) — del ở before, after toàn same
{
  const { before, after } = diffWords('at a whopping 85%', 'at 85%')
  check('xóa cụm → before del "a whopping"', before.filter((t) => t.op === 'del').map((t) => t.text).join(' ') === 'a whopping')
  check('xóa cụm → after không có ins', after.every((t) => t.op === 'same'))
}
// 3) chèn từ mới — after có ins, before toàn same
{
  const { before, after } = diffWords('The government should act', 'The government should act now')
  check('chèn từ → before toàn same', before.every((t) => t.op === 'same'))
  check('chèn từ → after ins "now"', after.filter((t) => t.op === 'ins').map((t) => t.text).join() === 'now')
}
// 4) sửa chính tả (goverment→government) — token khác nhau → del+ins cùng vị trí
{
  const { before, after } = diffWords('the goverment invests', 'the government invests')
  check('sửa chính tả → del "goverment" + ins "government"',
    before.some((t) => t.op === 'del' && t.text === 'goverment') && after.some((t) => t.op === 'ins' && t.text === 'government'))
}
// 5) case-sensitive: đổi hoa/thường cũng là sửa
{
  const { before, after } = diffWords('however, this is true', 'However, this is true')
  check('đổi hoa/thường → được coi là thay đổi', before[0].op === 'del' && after[0].op === 'ins')
}
// 6) giống hệt nhau — không có del/ins
{
  const { before, after } = diffWords('no change here', 'no change here')
  check('giống hệt → toàn same 2 phía', before.every((t) => t.op === 'same') && after.every((t) => t.op === 'same'))
  check('giống hệt → ops đối xứng', ops(before) === ops(after))
}
// 7) chuỗi rỗng/khoảng trắng — không crash
{
  check('before rỗng → chỉ ins', diffWords('', 'all new').before.length === 0 && diffWords('', 'all new').after.every((t) => t.op === 'ins'))
  check('after rỗng → chỉ del', diffWords('all old', '').after.length === 0 && diffWords('all old', '').before.every((t) => t.op === 'del'))
  check('cả 2 rỗng → không crash', diffWords('  ', ' ').before.length === 0)
}
// 8) unicode tiếng Việt + dấu câu dính từ
{
  const { before, after } = diffWords('tôi thích café lắm', 'tôi rất thích café')
  check('unicode → reconstruct lossless', joinSide(before) === 'tôi thích café lắm' && joinSide(after) === 'tôi rất thích café')
}
// 9) guard input dài bất thường (cap 200 token/vế) — không treo
{
  const long = Array(500).fill('word').join(' ')
  const t0 = Date.now()
  const { before } = diffWords(long, `${long} extra`)
  check('input 500 token → cap 200, không treo', before.length <= 200 && Date.now() - t0 < 2000)
}

// hasUsefulFix — quyết định card dùng layout diff hay fallback suggestion
check('hasUsefulFix: undefined → false', !hasUsefulFix('quote', undefined))
check('hasUsefulFix: "" (OpenAI strict không-áp-dụng) → false', !hasUsefulFix('quote', ''))
check('hasUsefulFix: chỉ whitespace → false', !hasUsefulFix('quote', '   '))
check('hasUsefulFix: giống hệt quote → false (không có gì để diff)', !hasUsefulFix('same text', ' same text '))
check('hasUsefulFix: fix thật → true', hasUsefulFix('is increase', 'increases'))

// 10) MUTATION GUARD — assertion không tautology: output bẩn phải làm reconstruct lệch.
{
  const mutant = (a, b) => { const d = diffWords(a, b); return { ...d, before: [...d.before, { text: 'EXTRA', op: 'same' }] } }
  check('mutation guard → reconstruct KHÁC khi output bị bẩn', joinSide(mutant('a b', 'a b').before) !== 'a b')
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
