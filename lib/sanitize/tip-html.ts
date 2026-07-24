import 'server-only'
import sanitizeHtml from 'sanitize-html'
import { isAllowedPublicMediaUrl } from '@/lib/storage/media-url'

// Tips body: soạn kiểu Word bằng TipTap (components/admin/TipRichEditor) → cần allowlist RỘNG hơn passage:
//   <img> inline, <a> liên kết, <table> bảng, <blockquote> trích dẫn, <hr>, và cỡ ảnh qua style width.
// 🔐 LUẬT THÉP (chốt bảo mật cuối, chạy cả lúc LƯU lẫn lúc RENDER public):
//   • <img> chỉ giữ nếu src THUỘC storage allowlist công khai (isAllowedPublicMediaUrl) — exclusiveFilter loại
//     mọi src lạ (host ngoài, data:, javascript:) → chống XSS/SSRF/hotlink dù admin bị chiếm quyền/ghi thẳng DB.
//   • <a> chỉ scheme http/https/mailto (allowedSchemes) → javascript:/data: bị gỡ href; ép rel/target an toàn.
//   • style chỉ giữ text-align / text-indent / width / min-width (allowedStyles regex) → không lọt CSS injection.
//   • KHÔNG cho phép class/id/on*-handler/script/iframe (mặc định sanitize-html loại).
//   KHÔNG mở các thẻ này cho passage đề thi (sanitizePassageHtml giữ nguyên chính sách cũ, không ảnh/không bảng).
const CELL_ATTRS = ['colspan', 'rowspan', 'colwidth']
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h2', 'h3', 'ul', 'ol', 'li', 'span', 'blockquote', 'hr',
    'a', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'colgroup', 'col',
  ],
  allowedAttributes: {
    '*': ['style'],
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt'],
    td: CELL_ATTRS,
    th: CELL_ATTRS,
    col: ['span'],
  },
  allowedStyles: {
    '*': {
      'text-align': [/^(left|right|center|justify)$/],
      'text-indent': [/^-?\d+(\.\d+)?(px|em|rem|%)$/],
      width: [/^\d{1,4}(\.\d+)?(px|%|em|rem)$/],
      'min-width': [/^\d{1,4}(\.\d+)?px$/],
    },
  },
  transformTags: {
    div: 'p',
    // Ép mọi <a> thành liên kết an toàn (rel chống tab-nabbing + nofollow), giữ href (đã lọc scheme).
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener nofollow ugc', target: '_blank' }, true),
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  disallowedTagsMode: 'discard',
  // Giữ <img> CHỈ khi src hợp lệ (storage public allowlist); còn lại loại cả thẻ.
  exclusiveFilter: (frame) => frame.tag === 'img' && !isAllowedPublicMediaUrl(frame.attribs?.src),
}

export function sanitizeTipHtml(html: unknown): string {
  if (typeof html !== 'string' || html.trim() === '') return ''
  const clean = sanitizeHtml(html, OPTIONS)
  // Gộp <ol>/<ul> LIỀN KỀ: nội dung dán từ Word/PDF hay tách mỗi mục thành 1 <ol> riêng → mỗi list tự đánh
  //   lại số từ 1 (hiển thị toàn "1."). Nối các list sát nhau → đánh số liên tục 1,2,3. Chạy cả lúc lưu lẫn
  //   lúc render public nên bài đã lưu sai trước đó cũng tự sửa.
  return clean.replace(/<\/ol>\s*<ol(?:\s[^>]*)?>/gi, '').replace(/<\/ul>\s*<ul(?:\s[^>]*)?>/gi, '')
}
