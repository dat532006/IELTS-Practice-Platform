// SEC-006 — Client-safe passage HTML sanitizer. Cùng allowlist với server (lib/sanitize/passage-html.ts)
// nhưng KHÔNG 'server-only': dùng ở admin form để dọn HTML import/preview TRƯỚC khi vào DOM
//   (RichTextEditor.innerHTML + preview dangerouslySetInnerHTML) — chống XSS admin-origin khi nạp
//   test.draft.json chứa <img onerror>/<svg onload>/on*-handler/script. Server vẫn sanitize lần nữa
//   lúc save + lúc trả exam payload (defense-in-depth). Isomorphic: SSR (không có DOMParser) → '' an toàn.

// Bộ thẻ cho phép (khớp OPTIONS.allowedTags của server; div→p).
const ALLOWED_TAGS = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'H2', 'H3', 'UL', 'OL', 'LI', 'SPAN'])
// Thẻ nguy hiểm: bỏ CẢ nội dung (không giữ text con) — tránh rò script/style/markup thực thi.
const DROP_CONTENT = new Set([
  'SCRIPT', 'STYLE', 'SVG', 'MATH', 'IFRAME', 'NOSCRIPT', 'TEMPLATE', 'OBJECT', 'EMBED', 'LINK', 'META', 'HEAD',
])

const esc = (s: string) =>
  s.replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'))

// style: CHỈ giữ text-align + text-indent (khớp allowedStyles của server). Regex chặn giá trị lạ → không injection.
function sanitizeStyle(style: string): string {
  const out: string[] = []
  for (const decl of style.split(';')) {
    const idx = decl.indexOf(':')
    if (idx < 0) continue
    const prop = decl.slice(0, idx).trim().toLowerCase()
    const val = decl.slice(idx + 1).trim()
    if (!prop || !val) continue
    if (prop === 'text-align' && /^(left|right|center|justify)$/i.test(val)) out.push(`text-align:${val.toLowerCase()}`)
    else if (prop === 'text-indent' && /^-?\d+(\.\d+)?(px|em|rem|%)$/i.test(val)) out.push(`text-indent:${val}`)
  }
  return out.join(';')
}

function walk(node: Node): string {
  let out = ''
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3 /* TEXT_NODE */) {
      out += esc(child.textContent ?? '')
    } else if (child.nodeType === 1 /* ELEMENT_NODE */) {
      const el = child as Element
      const raw = el.tagName.toUpperCase()
      const tag = raw === 'DIV' ? 'P' : raw
      if (DROP_CONTENT.has(raw)) return // bỏ luôn nội dung
      if (tag === 'BR') {
        out += '<br>'
      } else if (ALLOWED_TAGS.has(tag)) {
        const style = sanitizeStyle(el.getAttribute('style') ?? '')
        const t = tag.toLowerCase()
        out += style ? `<${t} style="${style}">${walk(el)}</${t}>` : `<${t}>${walk(el)}</${t}>`
      } else {
        // Thẻ không cho phép nhưng không nguy hiểm (a/img/table…) → bỏ THẺ, GIỮ text con (giống discard server).
        out += walk(el)
      }
    }
  })
  return out
}

// Sanitize 1 chuỗi HTML passage phía client. Không có DOMParser (SSR) → '' (nội dung chỉ xuất hiện client-side
//   trong luồng admin import/preview). Rỗng/không phải string → ''.
export function sanitizePassageHtmlClient(html: unknown): string {
  if (typeof html !== 'string' || html.trim() === '') return ''
  if (typeof DOMParser === 'undefined') return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return walk(doc.body)
}
