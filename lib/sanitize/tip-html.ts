import 'server-only'
import sanitizeHtml from 'sanitize-html'
import { isAllowedPublicMediaUrl } from '@/lib/storage/media-url'

// Tips body: cùng allowlist với passage (lib/sanitize/passage-html) NHƯNG cho phép <img> inline —
//   vì bài Tips cần chèn ảnh minh hoạ như Word. Ảnh admin upload qua /api/admin/media (bucket 'media'
//   public) → src = public_url origin Supabase Storage.
// 🔐 LUẬT THÉP: <img> chỉ được giữ nếu src THUỘC storage allowlist công khai (isAllowedPublicMediaUrl:
//   origin Supabase/CDN + path /storage/v1/object/public/). exclusiveFilter loại mọi <img> src lạ
//   (host ngoài, data:, javascript:) → chống XSS/SSRF/hotlink dù admin bị chiếm quyền hay ghi thẳng DB.
//   KHÔNG mở <img> cho passage đề thi (sanitizePassageHtml giữ nguyên chính sách cũ).
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h2', 'h3', 'ul', 'ol', 'li', 'span', 'img'],
  allowedAttributes: {
    '*': ['style'],
    img: ['src', 'alt'],
  },
  allowedStyles: {
    '*': {
      'text-align': [/^(left|right|center|justify)$/],
      'text-indent': [/^-?\d+(\.\d+)?(px|em|rem|%)$/],
    },
  },
  transformTags: { div: 'p' },
  allowedSchemes: ['http', 'https'],
  disallowedTagsMode: 'discard',
  // Giữ <img> CHỈ khi src hợp lệ (storage public allowlist); còn lại loại cả thẻ.
  exclusiveFilter: (frame) => frame.tag === 'img' && !isAllowedPublicMediaUrl(frame.attribs?.src),
}

export function sanitizeTipHtml(html: unknown): string {
  if (typeof html !== 'string' || html.trim() === '') return ''
  return sanitizeHtml(html, OPTIONS)
}
