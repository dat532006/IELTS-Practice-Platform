// AI-006 smoke — hợp đồng task1/task2 (lib/exam/writing-prompts.ts), import module PRODUCTION.
//   Bug gốc: mapping đề Writing rơi về VỊ TRÍ (form không sinh id task1/task2) → đảo passage là tráo
//   đề Task 1 ↔ Task 2 âm thầm; và prompt rỗng lọt qua mọi kiểm tra.
//     node supabase/smoke/writing_prompts_smoke.mjs
import {
  pickTaskPassage,
  normalizeWritingPassageIds,
  isBlankHtml,
  lintWritingPrompts,
} from '../../lib/exam/writing-prompts.ts'

let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

console.log('AI-006 — pickTaskPassage (id thắng vị trí):')
{
  const t1 = { id: 'task1', content: 'Đề 1' }
  const t2 = { id: 'task2', content: 'Đề 2' }
  // TRÁI TIM của bug: đề lưu NGƯỢC thứ tự [task2, task1] — id phải thắng, không được lấy theo vị trí.
  check('id đúng thắng vị trí (mảng đảo ngược vẫn ra đúng task)',
    pickTaskPassage([t2, t1], 0, 'task1') === t1 && pickTaskPassage([t2, t1], 1, 'task2') === t2)
  check('không có id đúng → fallback vị trí (đề cũ p1/p2 không gãy)',
    pickTaskPassage([{ id: 'p1', content: 'a' }, { id: 'p2', content: 'b' }], 1, 'task2')?.content === 'b')
  check('mảng rỗng → null (không throw)', pickTaskPassage([], 0, 'task1') === null)
  check('index ngoài mảng → null', pickTaskPassage([{ id: 'p1' }], 1, 'task2') === null)
}

console.log('\nAI-006 — normalizeWritingPassageIds (authoring):')
{
  const norm = normalizeWritingPassageIds([{ id: 'p_abc', content: 'a' }, { id: 'p_xyz', content: 'b' }])
  check('id uid form → gán task1/task2 theo vị trí', norm[0].id === 'task1' && norm[1].id === 'task2')
  check('không mutate input (trả mảng mới)', norm[0].content === 'a' && norm[1].content === 'b')

  // BẤT BIẾN CHỐNG TRÁO ĐỀ: đã mang id task thì GIỮ NGUYÊN kể cả đứng sai vị trí.
  const swapped = normalizeWritingPassageIds([{ id: 'task2', content: 'Đề 2' }, { id: 'task1', content: 'Đề 1' }])
  check('id task đứng sai vị trí → GIỮ NGUYÊN (không tráo theo vị trí)',
    swapped[0].id === 'task2' && swapped[1].id === 'task1', JSON.stringify(swapped))

  const half = normalizeWritingPassageIds([{ id: 'task2', content: 'x' }, { id: 'p_1', content: 'y' }])
  check('chỉ có task2 → passage còn lại nhận task1', half[0].id === 'task2' && half[1].id === 'task1')

  const dup = normalizeWritingPassageIds([{ id: 'task1', content: 'a' }, { id: 'task1', content: 'b' }])
  check('id task1 TRÙNG → bản sau nhận task2 (deterministic, không đôi task1)',
    dup[0].id === 'task1' && dup[1].id === 'task2', JSON.stringify(dup))

  const three = normalizeWritingPassageIds([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
  check('3 passage → 2 đầu nhận task id, passage thừa giữ id gốc (lint chặn, không cắt dữ liệu)',
    three[0].id === 'task1' && three[1].id === 'task2' && three[2].id === 'c')
  check('mảng rỗng → mảng rỗng (không throw)', normalizeWritingPassageIds([]).length === 0)
}

console.log('\nAI-006 — isBlankHtml (prompt là HTML rich):')
{
  check("'<p><br></p>' là RỖNG", isBlankHtml('<p><br></p>'))
  check("'<p>&nbsp; </p>' là RỖNG", isBlankHtml('<p>&nbsp; </p>'))
  check("'' là RỖNG", isBlankHtml(''))
  check('undefined là RỖNG', isBlankHtml(undefined))
  check("'<p>Describe the chart.</p>' KHÔNG rỗng", !isBlankHtml('<p>Describe the chart.</p>'))
  check('plain text KHÔNG rỗng', !isBlankHtml('Discuss both views.'))
}

console.log('\nAI-006 — lintWritingPrompts (lỗi phải NÓI RÕ, không im lặng):')
{
  const good = [{ id: 'p1', content: '<p>Đề 1</p>' }, { id: 'p2', content: '<p>Đề 2</p>' }]
  check('2 passage đủ nội dung (id chưa chuẩn — normalize lo) → KHÔNG lỗi', lintWritingPrompts(good).length === 0, JSON.stringify(lintWritingPrompts(good)))
  const one = lintWritingPrompts([{ id: 'p1', content: '<p>Đề 1</p>' }])
  check('1 passage → lỗi thiếu passage + lỗi Task 2 trống', one.length === 2, JSON.stringify(one))
  const blank2 = lintWritingPrompts([{ id: 'task1', content: '<p>Đề 1</p>' }, { id: 'task2', content: '<p><br></p>' }])
  check('Task 2 rỗng HTML vỏ → đúng 1 lỗi, nêu đích danh Task 2',
    blank2.length === 1 && /Task 2/.test(blank2[0]), JSON.stringify(blank2))
  const zero = lintWritingPrompts([])
  check('0 passage → 3 lỗi (thiếu + cả 2 task trống)', zero.length === 3, JSON.stringify(zero))
  check('lỗi rỗng là ERROR-đúng-nghĩa: message nhắc "AI sẽ chấm bài với đề rỗng"',
    zero.some((m) => /đề rỗng/i.test(m)))
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
