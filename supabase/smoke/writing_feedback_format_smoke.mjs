// UI regression gate: feedback AI dạng một chuỗi dài phải được tách thành các section/ý đọc được.
// Chạy module production thật, không mock lại parser.
import { parseWritingFeedback } from '../../lib/writing/feedback-format.ts'

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

const wallOfText =
  'Task Achievement 5: Bài có overview rõ và chọn số liệu chính. Tuy nhiên, bài ghi sai một mốc thời gian. Sai lệch này khiến báo cáo chưa đạt Band 6. ' +
  'Coherence & Cohesion 7: Bố cục logic và liên kết rõ ràng. Chưa đạt Band 8 vì một vài nhận xét chưa được định vị rõ. ' +
  'Lexical Resource 7: Từ vựng đa dạng và khá chính xác. Ví dụ “substantial decreases” được dùng phù hợp. ' +
  'Grammatical Range & Accuracy 8: Có nhiều cấu trúc phức chính xác. Hầu như không có lỗi ngữ pháp hoặc dấu câu.'

const sections = parseWritingFeedback(wallOfText)
check('tách đủ 4 tiêu chí từ một đoạn liên tục', sections.length === 4, `got ${sections.length}`)
check(
  'giữ đúng thứ tự tiêu chí',
  sections.map((section) => section.criterion).join(',') ===
    'task_response,coherence_cohesion,lexical_resource,grammar',
)
check('đọc đúng band gắn trong heading', sections.map((section) => section.band).join(',') === '5,7,7,8')
check('tách Task Achievement thành nhiều ý con', sections[0]?.points.length >= 2, `got ${sections[0]?.points.length}`)
check('giữ nguyên ví dụ trích dẫn để UI nhấn mạnh', sections[2]?.points.some((point) => point.includes('“substantial decreases”')))

const markdown = parseWritingFeedback(
  '**Task Response (Band 6.5):** Trả lời đúng trọng tâm.\n**Grammar: ** Cần kiểm tra dấu câu.',
)
check('hỗ trợ heading markdown cũ', markdown.length === 2)
check('hỗ trợ band 0.5', markdown[0]?.band === 6.5)

const fallback = parseWritingFeedback('Điểm mạnh: overview rõ.\n- Cần cải thiện cách nhóm số liệu.\n- Ví dụ nên chính xác hơn.')
check('feedback không có heading vẫn hiển thị tổng quan', fallback.length === 1 && fallback[0]?.criterion === 'general')
check('feedback xuống dòng/list được giữ thành ý riêng', fallback[0]?.points.length === 3, `got ${fallback[0]?.points.length}`)
check('chuỗi rỗng degrade sạch', parseWritingFeedback('   ').length === 0)

// FB-03 (Owner báo 2026-07-18): cue KHÔNG được cắt ngang câu — chỉ ngắt ý tại ranh giới câu.
const midCue = parseWritingFeedback(
  'Task Response 7: Lập luận rõ và có ví dụ đi kèm. Vì vậy bài chưa đạt Band 8 do thiếu dẫn chứng cụ thể.',
)
check(
  '"Vì vậy bài chưa đạt Band 8..." giữ nguyên 1 ý (không chặt tại "Chưa đạt")',
  midCue[0]?.points.some((p) => p.includes('Vì vậy bài chưa đạt Band 8')),
  JSON.stringify(midCue[0]?.points),
)
check('không ý nào kết thúc lửng "Vì vậy bài"', midCue[0]?.points.every((p) => !/Vì vậy bài$/u.test(p)))
const dangling = parseWritingFeedback(
  'Grammar 8: Câu phức được dùng chính xác và đa dạng hơn hẳn phần trước đó, cần tiếp tục phát huy thêm nữa để giữ phong độ ổn định về sau này tiếp. Bài chưa đạt Band 9 vì còn vài lỗi nhỏ.',
)
check(
  'chủ ngữ "Bài" KHÔNG bị bỏ rơi cuối ý trước ("... tiếp." hết câu)',
  dangling[0]?.points.every((p) => !/\sBài$/u.test(p)),
  JSON.stringify(dangling[0]?.points),
)
check('"Bài chưa đạt Band 9..." nằm nguyên trong 1 ý', dangling[0]?.points.some((p) => p.includes('Bài chưa đạt Band 9 vì còn vài lỗi nhỏ')))

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
