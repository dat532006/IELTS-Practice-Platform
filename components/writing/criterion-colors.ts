// Màu 4 tiêu chí chấm Writing (+ "general") — MỘT nguồn cho WritingResultView (thẻ điểm, lộ trình cải thiện)
// và WritingFeedback. Trước đây mỗi file chép một bảng riêng và dùng luôn `accent` làm màu chữ (2.7–4.1:1).
//   accent : trang trí (viền trái, chấm, thanh tiến độ) — KHÔNG dùng cho chữ
//   soft   : nền tint của chip / ô số thứ tự
//   text   : chữ trên nền trắng và trên `soft` (≥ 4.98:1 trên cả hai, đo bằng reports/impeccable/tools/contrast.mjs)
export type WritingCriterionKey = 'task_response' | 'coherence_cohesion' | 'lexical_resource' | 'grammar' | 'general'

export const WRITING_CRITERION_COLOR: Record<WritingCriterionKey, { accent: string; soft: string; text: string }> = {
  task_response: { accent: '#7C5CE6', soft: '#F2EEFF', text: '#6A48D6' },
  coherence_cohesion: { accent: '#3B82F6', soft: '#EEF6FF', text: '#1F5FD9' },
  lexical_resource: { accent: '#D97706', soft: '#FFF6E5', text: '#A34E08' },
  grammar: { accent: '#F26B4D', soft: '#FFF0EB', text: '#B14724' },
  general: { accent: '#6A4BD0', soft: '#F6F3FF', text: '#6A4BD0' },
}
