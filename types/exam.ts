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
  cover_image: string | null // URL ảnh minh họa (PUBLIC metadata); null → cover fallback trang trí
  // Khung cover cắt giữa cứng → 3 số này cho Owner kéo/phóng trong admin (xem migration
  //   20260726000100). Mặc định 50/50/100 = canh giữa, vừa khung — y hệt hành vi trước đó.
  cover_pos_x: number // object-position X, 0–100 (%)
  cover_pos_y: number // object-position Y, 0–100 (%)
  cover_zoom: number // % phóng, 100–300
  locked: boolean
  // FE-F01: product published chứa test (mục lục RLS published-only) — CTA mua ở pre-exam khi locked.
  //   null khi test chưa thuộc bundle nào (CTA fallback /products). Vẫn chỉ metadata public.
  product: { slug: string; title: string } | null
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
  answers_rev: number // EXAM-004: rev optimistic-concurrency; client gửi lại làm expected_rev khi autosave/submit
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
  explanation?: string // P3: giải thích/evidence — admin author ở answer_keys; chỉ owner + terminal (cùng đường correct_answers)
  // EXAM-006: evidence chuẩn hóa về descriptor — quote + occurrence/context để khử trùng khi highlight.
  evidence?: { quote: string; occurrence?: number; context_before?: string; context_after?: string }
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
  // EXAM-003/009: nội dung để render review (passages+questions) — TỪ BẢN CHỤP lúc START (độc lập published
  //   visibility + cố định khi đề bị sửa). Review-in-exam dùng cái này, KHÔNG gọi /api/exam published-only nữa.
  content: { passages: unknown; questions: unknown; audio_url: string | null }
  content_stale: boolean // true = attempt cũ không có bản chụp → fallback nội dung hiện tại ("bản gốc có thể đã đổi")
}

// W10 Writing AI grade — M07. KHÔNG bao giờ kèm system prompt / API key / raw provider response.
//   overall_band do SERVER tính (T1×1/3 + T2×2/3, round 0.5) — KHÔNG tin AI overall.
export type WritingErrorHighlight = {
  quote: string
  type: 'task_response' | 'coherence_cohesion' | 'lexical_resource' | 'grammar'
  suggestion: string
  // FB-01: optional — bài chấm cũ không có; '' = không áp dụng (OpenAI strict required-nhưng-cho-rỗng).
  fix?: string // bản viết lại TỐI THIỂU của quote (English) — UI diff từng từ với quote để tô màu
  reason_vi?: string // giải thích tiếng Việt: sai vì sao (quy tắc/lý do)
}
// FB-02: item "Lộ trình cải thiện" có cấu trúc (thay suggestions text tự do).
export type WritingImprovementItem = {
  criterion: 'task_response' | 'coherence_cohesion' | 'lexical_resource' | 'grammar' | 'general'
  kind: 'fix' | 'keep' // fix = việc cần sửa; keep = điểm mạnh cần duy trì
  priority: 1 | 2 | 3 // 1 = tác động band lớn nhất
  title_vi: string
  detail_vi: string
  example?: string
}
// AI-005: bảng "vocabulary upgrade" — từ/cụm đáng học lấy TỪ corrected_version của chính task đó.
export type WritingVocabUpgrade = {
  word: string
  level: 'B2' | 'C1' | 'C2'
  meaning_vi: string
  why: string
  example: string
}
export type WritingTaskGrade = {
  band: number // 0..9, bước 0.5
  criteria: { task_response: number; coherence_cohesion: number; lexical_resource: number; grammar: number }
  feedback: string
  suggestions: string[]
  error_highlights?: WritingErrorHighlight[] // W11: optional, đã Zod-validate và giới hạn trước khi lưu/trả
  // AI-005: optional — Anthropic (đường lui) được phép bỏ qua, và bài chấm TRƯỚC 2026-07-16 trong DB
  //   không có 2 field này (ai_score là jsonb, không migration) → UI phải render có điều kiện.
  corrected_version?: string // Version A — bài viết lại (tiếng Anh), giữ ý/trình độ gốc
  vocabulary_upgrades?: WritingVocabUpgrade[]
  improvement_plan?: WritingImprovementItem[] // FB-02: optional — bài cũ chỉ có suggestions
}
export type WritingGradeResult = {
  attempt_id: string
  task1: WritingTaskGrade
  task2: WritingTaskGrade
  overall_band: number // server-computed
  task1_wc: number
  task2_wc: number
  graded_at: string
  mock: boolean // true nếu chấm bằng mock grader (thiếu key AI ở non-prod) — KHÔNG claim live
  coins_charged?: number // pay-per-grade: số coins đã trừ cho lượt này (0/undefined = trong hạn free/ngày)
  // FB-01: bài làm của CHÍNH owner (GET /api/writing-result đọc từ writing_submissions) — để trang
  //   xem lại render essay kèm highlight lỗi. Owner-only theo guard sẵn có; KHÔNG phải dữ liệu nhạy cảm mới.
  essays?: { task1: string; task2: string }
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

