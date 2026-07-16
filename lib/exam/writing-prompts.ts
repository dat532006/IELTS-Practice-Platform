// ============================================================
// AI-006 — Hợp đồng task1/task2 cho đề Writing, MỘT chỗ duy nhất.
// Bug gốc (Owner báo 2026-07-17): hợp đồng "tìm passage id 'task1'/'task2' trước, fallback vị trí"
//   bị COPY TAY ở 2 nơi (lib/exam/writing.ts extractPrompts + WritingRunner getPrompts), còn form admin
//   thì sinh id uid('p') — không bao giờ ra 'task1' → mapping RƠI VỀ VỊ TRÍ. Thêm/xoá/đảo passage là
//   Task 1 ↔ Task 2 tráo nhau KHÔNG một cảnh báo, AI chấm bài Task 1 theo đề Task 2.
// Fix: form normalize id về task1/task2 lúc build payload (id thắng vị trí một khi đã gán đúng);
//   cả 2 runtime dùng chung pickTaskPassage; lint + SQL publish guard chặn đề thiếu/rỗng prompt.
// PURE: không import, không 'server-only', không alias '@/' → Node type-strip test trực tiếp,
//   client component (AdminTestForm/WritingRunner) import được.
// ============================================================

export const WRITING_TASK_IDS = ['task1', 'task2'] as const
export type WritingTaskId = (typeof WRITING_TASK_IDS)[number]

type PassageLike = { id?: unknown; content?: unknown }

// Hợp đồng runtime DUY NHẤT: id đúng thắng tuyệt đối; không có id đúng → fallback theo vị trí
//   (giữ tương thích đề cũ đã publish với id p1/p2 — không làm gãy dữ liệu lịch sử).
export function pickTaskPassage<T extends PassageLike>(arr: readonly T[], index: number, taskId: WritingTaskId): T | null {
  return arr.find((p) => p?.id === taskId) ?? arr[index] ?? null
}

// Prompt writing là HTML rich (RichTextEditor) → "rỗng" phải hiểu sau khi bóc tag: '<p><br></p>',
//   '<p>&nbsp;</p>' đều là rỗng. Không bóc thì check .trim() luôn xanh giả trên HTML vỏ.
export function isBlankHtml(html: unknown): boolean {
  if (typeof html !== 'string') return true
  return (
    html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/ /g, ' ')
      .trim() === ''
  )
}

// Chuẩn hoá id lúc AUTHORING (form build payload):
//   • passage ĐÃ mang id task1/task2 → GIỮ NGUYÊN (kể cả đứng sai vị trí — id là sự thật, không phải
//     vị trí; đây chính là chỗ chống tráo đề khi admin đảo thứ tự).
//   • passage còn lại nhận task id còn thiếu theo thứ tự xuất hiện.
//   • passage thừa (>2) giữ id gốc — lint/SQL guard sẽ chặn, không âm thầm cắt dữ liệu.
export function normalizeWritingPassageIds<T extends PassageLike>(passages: readonly T[]): T[] {
  const claimed = new Set<string>()
  for (const p of passages) {
    const id = typeof p?.id === 'string' ? p.id : ''
    if ((WRITING_TASK_IDS as readonly string[]).includes(id) && !claimed.has(id)) claimed.add(id)
  }
  const missing = WRITING_TASK_IDS.filter((t) => !claimed.has(t))
  let mi = 0
  const seen = new Set<string>()
  return passages.map((p) => {
    const id = typeof p?.id === 'string' ? p.id : ''
    const isTask = (WRITING_TASK_IDS as readonly string[]).includes(id)
    if (isTask && !seen.has(id)) {
      seen.add(id)
      return p
    }
    if (mi < missing.length) return { ...p, id: missing[mi++] }
    return p
  })
}

// Lint authoring (form + nơi khác cần) — trả MỌI lỗi (không chỉ lỗi đầu) để admin sửa một lượt.
//   Đề writing: passage CHÍNH LÀ đề bài → thiếu/rỗng là lỗi 'error', không phải 'warn'.
export function lintWritingPrompts(passages: readonly PassageLike[]): string[] {
  const out: string[] = []
  if (passages.length !== 2) {
    out.push(`Đề Writing cần đúng 2 passage (Passage 1 = đề Task 1, Passage 2 = đề Task 2) — hiện có ${passages.length}.`)
  }
  const norm = normalizeWritingPassageIds(passages)
  WRITING_TASK_IDS.forEach((taskId, i) => {
    const p = norm.find((x) => x?.id === taskId) ?? null
    if (!p || isBlankHtml(p.content)) {
      out.push(`Đề Task ${i + 1} đang TRỐNG — publish thế này AI sẽ chấm bài với đề rỗng.`)
    }
  })
  return out
}
