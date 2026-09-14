// ============================================================
// W6 — Reading question components (M06). Render-only; KHÔNG biết đáp án, KHÔNG chấm (LUẬT THÉP #2).
// Answer serialize theo `question.id`: string (single) | string[] (mcq_multi). Khớp BE scoring.
// ============================================================

export type AnswerValue = string | string[]

export type QOption = { key: string; text?: string }

// Question payload (render-only whitelist). KHÔNG có field đáp án.
export type ExamQuestion = {
  id: string
  number?: number
  type?: string
  instruction?: string
  passage_id?: string
  section_id?: string // Listening: section chứa câu hỏi
  prompt?: string // câu/đoạn có chỗ trống, hoặc statement
  statement?: string // alias cho tf/yn
  options?: QOption[] // mcq / matching bank
  select_count?: number // gợi ý số lựa chọn mcq_multi (chỉ hiển thị)
  // W7 Listening diagram/map: nền + vị trí input overlay theo % (tùy chọn).
  image?: string // URL/data-URI nền diagram/map (render-only)
  x?: number // vị trí input overlay theo % (0..100) khi có image
  y?: number
}

export type QuestionComponentProps = {
  question: ExamQuestion
  value: AnswerValue | undefined
  onChange: (value: AnswerValue) => void
  disabled?: boolean
  contrast?: boolean
  // W9 parity (capture): statement/prompt đã render INLINE cạnh số câu ở ExamRunner → component bỏ qua.
  hideStatement?: boolean
}

// Chuẩn hóa type payload → nhóm renderer. Unknown → 'fallback' (an toàn).
export type RenderKind =
  | 'gap'
  | 'mcq_single'
  | 'mcq_multi'
  | 'tfng'
  | 'ynng'
  | 'matching'
  | 'diagram'
  | 'map'
  | 'fallback'

const GAP = new Set([
  'gap',
  'gap_filling',
  'summary',
  'summary_completion',
  'sentence_completion',
  'short_answer',
  'note_completion',
  'table_completion',
  // W7 Listening — form/flow-chart completion là text gap (khớp BE ALLOWED_KEY_TYPES).
  'form_completion',
  'flowchart_completion',
])
const MCQ_SINGLE = new Set(['mcq', 'mcq_single'])
const TFNG = new Set(['tfng', 'tf_ng', 'true_false_notgiven'])
const YNNG = new Set(['ynng', 'yn_ng', 'yes_no_notgiven'])
const MATCHING = new Set([
  'matching',
  'matching_headings',
  'matching_information',
  'matching_features',
  'matching_endings',
])
// W7 Listening — nhãn trên sơ đồ / bản đồ-mặt bằng.
const DIAGRAM = new Set(['diagram_label', 'diagram'])
const MAP = new Set(['map_labelling', 'plan_map_diagram', 'map', 'plan'])

export function renderKindOf(type: string | undefined): RenderKind {
  const t = (type ?? '').toLowerCase().trim()
  if (t === 'mcq_multi') return 'mcq_multi'
  if (MCQ_SINGLE.has(t)) return 'mcq_single'
  if (TFNG.has(t)) return 'tfng'
  if (YNNG.has(t)) return 'ynng'
  if (MATCHING.has(t)) return 'matching'
  if (DIAGRAM.has(t)) return 'diagram'
  if (MAP.has(t)) return 'map'
  if (GAP.has(t)) return 'gap'
  return 'fallback'
}

// Nhãn hiển thị cho mã dạng câu hỏi (tests.question_types / question.type). CHỈ để hiển thị —
//   giá trị gốc lưu DB, filter `qtype` và scoring giữ nguyên mã. Thêm type mới ở GAP/MATCHING... thì
//   thêm nhãn ở đây; mã lạ rơi về dạng "gap filling" → "Gap filling" thay vì lộ mã snake_case.
const QUESTION_TYPE_LABEL: Record<string, string> = {
  gap: 'Điền từ',
  gap_filling: 'Điền từ',
  summary: 'Hoàn thành tóm tắt',
  summary_completion: 'Hoàn thành tóm tắt',
  sentence_completion: 'Hoàn thành câu',
  short_answer: 'Trả lời ngắn',
  note_completion: 'Hoàn thành ghi chú',
  table_completion: 'Hoàn thành bảng',
  form_completion: 'Hoàn thành biểu mẫu',
  flowchart_completion: 'Hoàn thành lưu đồ',
  mcq: 'Trắc nghiệm',
  mcq_single: 'Trắc nghiệm',
  mcq_multi: 'Trắc nghiệm nhiều đáp án',
  tfng: 'True / False / Not Given',
  tf_ng: 'True / False / Not Given',
  true_false_notgiven: 'True / False / Not Given',
  ynng: 'Yes / No / Not Given',
  yn_ng: 'Yes / No / Not Given',
  yes_no_notgiven: 'Yes / No / Not Given',
  matching: 'Nối thông tin',
  matching_headings: 'Nối tiêu đề',
  matching_information: 'Nối thông tin đoạn',
  matching_features: 'Nối đặc điểm',
  matching_endings: 'Nối phần kết câu',
  diagram: 'Điền nhãn sơ đồ',
  diagram_label: 'Điền nhãn sơ đồ',
  map: 'Điền nhãn bản đồ',
  plan: 'Điền nhãn bản đồ',
  map_labelling: 'Điền nhãn bản đồ',
  plan_map_diagram: 'Điền nhãn bản đồ',
  writing_task1: 'Writing Task 1',
  writing_task2: 'Writing Task 2',
}

export function questionTypeLabel(type: string | undefined): string {
  const t = (type ?? '').toLowerCase().trim()
  const known = QUESTION_TYPE_LABEL[t]
  if (known) return known
  const words = t.replace(/[_-]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : ''
}

// Một câu được coi là "đã trả lời" khi: string trim≠'' hoặc array length>0.
export function isAnswered(value: AnswerValue | undefined): boolean {
  if (Array.isArray(value)) return value.length > 0
  return (value ?? '').trim() !== ''
}
