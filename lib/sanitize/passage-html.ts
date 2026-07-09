import 'server-only'
import sanitizeHtml from 'sanitize-html'

// M11 — Passage rich-text: HTML do ADMIN soạn (WYSIWYG) rồi RENDER cho thí sinh qua dangerouslySetInnerHTML.
// LUẬT THÉP mindset: dù chỉ admin (requireAdmin) mới soạn, VẪN sanitize allowlist trước khi HTML tới client —
//   chống paste-from-Word chèn <script>/style độc, chống tài khoản admin bị chiếm quyền, chống ghi thẳng DB.
// Chỉ cho bộ thẻ định dạng "chuẩn đề thi": KHÔNG script/style-tag/iframe/a/img, KHÔNG on*-handler;
//   style CHỈ text-align + text-indent (căn lề + thụt đầu dòng). <div> lạ → chuyển thành <p>.

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h2', 'h3', 'ul', 'ol', 'li', 'span'],
  allowedAttributes: { '*': ['style'] },
  allowedStyles: {
    '*': {
      'text-align': [/^(left|right|center|justify)$/],
      'text-indent': [/^-?\d+(\.\d+)?(px|em|rem|%)$/],
    },
  },
  transformTags: { div: 'p' }, // Chrome contentEditable hay tạo <div> cho dòng mới → gom về <p>
  allowedSchemes: [],
  disallowedTagsMode: 'discard',
}

// Có phải HTML rich không (để CHỌN nhánh render). Chỉ nhận diện thẻ trong allowlist → tránh false-positive "a < b".
const RICH_RE = /<(\/?)(p|br|strong|b|em|i|u|s|h2|h3|ul|ol|li|span|div)(\s|>|\/)/i
export function isRichHtml(v: unknown): boolean {
  return typeof v === 'string' && RICH_RE.test(v)
}

// Sanitize 1 chuỗi HTML passage. Rỗng/không phải string → ''.
export function sanitizePassageHtml(html: unknown): string {
  if (typeof html !== 'string' || html.trim() === '') return ''
  return sanitizeHtml(html, OPTIONS)
}

// Sanitize content từng passage NẾU là HTML rich; plain text để nguyên (nhánh render text — React tự escape).
//   Bất biến payload khác (id/title/subtitle/questions…) — chỉ đụng field content.
export function sanitizePassages<T>(passages: T): T {
  if (!Array.isArray(passages)) return passages
  return passages.map((p) => {
    if (!p || typeof p !== 'object') return p
    const rec = p as Record<string, unknown>
    if (isRichHtml(rec.content)) return { ...rec, content: sanitizePassageHtml(rec.content) }
    return p
  }) as unknown as T
}
