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

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
