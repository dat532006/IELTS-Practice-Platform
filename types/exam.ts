// W4 Exam/Test DTO — docs/TaskBrief/BackendEngineer/phase1/w4.md Task 4.3/4.4.
// LUẬT THÉP #2/#3: payload chỉ trả sau guard; KHÔNG bao giờ kèm answer_keys.

// Một test luôn có type cụ thể (KHÁC catalog Skill có thêm 'mixed' cho product gộp).
export type ExamSkill = 'reading' | 'listening' | 'writing'

// Payload đề thi — CHỈ trả khi guard pass (is_free | test_unlocks). KHÔNG có answer_keys.
export type ExamPayload = {
  test: { id: string; title: string; skill: ExamSkill; is_free: boolean }
  passages: unknown
  questions: unknown
  audio_url: string | null // signed URL Listening, chỉ sinh sau guard (R2 chưa wired → null)
}

// Metadata an toàn cho pre-exam page /tests/[id] — KHÔNG có passages/questions/audio.
export type TestMeta = {
  id: string
  title: string
  skill: ExamSkill
  duration_sec: number
  is_free: boolean
  difficulty: number | null
  source: string | null
  question_types: string[]
  locked: boolean
}

// W5 — Attempt lifecycle (M05). Timer neo server; client KHÔNG gửi thời gian tin cậy.
export type AttemptStatus = 'in_progress' | 'submitted' | 'expired'

export type AttemptDTO = {
  attempt_id: string
  test_id: string
  status: AttemptStatus
  started_at: string // ISO, server (DB default now())
  duration_sec: number // snapshot từ tests.duration_sec lúc tạo
  time_remaining_sec: number // server-computed = max(0, duration - elapsed)
  server_now: string // ISO server — client tính countdown chính xác
  highlights: unknown // W8: annotation owner (restore qua reload); shape = HighlightAnchor[]
  bookmarked_qs: string[] // W8: câu đã bookmark trong attempt
  answers?: Record<string, string | string[]> // W9: draft answers (autosave) — restore qua reload; KHÔNG đáp án đúng
}

// W8 result review — CHỈ owner + status submitted|expired (LUẬT THÉP #4).
// Review item là DTO SANITIZE: KHÔNG bao giờ kèm raw answer_keys/points/match (LUẬT THÉP #2).
export type ReviewItem = {
  question_id: string
  number?: number
  type?: string
  user_answer: string | string[] | null // từ attempt.answers[qid]; thiếu → null
  correct_answers: string[] // đáp án chấp nhận (hiển thị); chỉ owner + terminal mới nhận
  is_correct: boolean
}

export type ResultDTO = {
  attempt_id: string
  test: { id: string; title: string; skill: ExamSkill }
  status: 'submitted' | 'expired'
  submitted_at: string | null
  time_spent: number | null
  raw_score: number | null
  max_score: number | null
  band: number | null
  review: ReviewItem[]
  highlights: unknown // echo annotation của owner
  bookmarked_qs: string[] // echo câu đã bookmark trong attempt
}

// W10 Writing AI grade — M07. KHÔNG bao giờ kèm system prompt / API key / raw provider response.
//   overall_band do SERVER tính (T1×1/3 + T2×2/3, round 0.5) — KHÔNG tin AI overall.
export type WritingErrorHighlight = {
  quote: string
  type: 'task_response' | 'coherence_cohesion' | 'lexical_resource' | 'grammar'
  suggestion: string
}
export type WritingTaskGrade = {
  band: number // 0..9, bước 0.5
  criteria: { task_response: number; coherence_cohesion: number; lexical_resource: number; grammar: number }
  feedback: string
  suggestions: string[]
  error_highlights?: WritingErrorHighlight[] // W11: optional, đã Zod-validate và giới hạn trước khi lưu/trả
}
export type WritingGradeResult = {
  attempt_id: string
  task1: WritingTaskGrade
  task2: WritingTaskGrade
  overall_band: number // server-computed
  task1_wc: number
  task2_wc: number
  graded_at: string
  mock: boolean // true nếu chấm bằng mock grader (thiếu ANTHROPIC_API_KEY) — KHÔNG claim live
}

// W6 submit — scoring server-side. KHÔNG bao giờ kèm answer_keys/correct answers (LUẬT THÉP #2).
export type SubmitResult = {
  attempt_id: string
  status: 'submitted' | 'expired'
  time_spent: number // server-computed
  submitted_at: string // ISO server
  scored: boolean // W6: true nếu đã chấm theo answer_keys; false nếu thiếu answer_keys
  raw_score: number | null // Σ points câu đúng (null khi chưa/không chấm được)
  band: number | null // score_bands theo test type; null + warning nếu thiếu/không map
  max_score?: number | null // Σ points tối đa (an toàn hiển thị X/N; KHÔNG lộ đáp án)
}

