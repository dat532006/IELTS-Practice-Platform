// SEC-006 — Client-safe passage HTML sanitizer. Cùng allowlist với server (lib/sanitize/passage-html.ts)
// nhưng KHÔNG 'server-only': dùng ở admin form để dọn HTML import/preview TRƯỚC khi vào DOM
//   (RichTextEditor.innerHTML + preview dangerouslySetInnerHTML) — chống XSS admin-origin khi nạp
//   test.draft.json chứa <img onerror>/<svg onload>/on*-handler/script. Server vẫn sanitize lần nữa
//   lúc save + lúc trả exam payload (defense-in-depth). Isomorphic: SSR (không có DOMParser) → '' an toàn.
//
// Biến thể sanitizeTipHtmlClient: THÊM <img> (chỉ src thuộc storage allowlist) cho editor bài Tips —
//   khớp server lib/sanitize/tip-html.ts. Passage đề thi vẫn dùng sanitizePassageHtmlClient (KHÔNG ảnh).

import { isAllowedPublicMediaUrl } from '@/lib/storage/media-url'

// Bộ thẻ cho phép (khớp OPTIONS.allowedTags của server; div→p).
const ALLOWED_TAGS = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'H2', 'H3', 'UL', 'OL', 'LI', 'SPAN'])
// Thẻ nguy hiểm: bỏ CẢ nội dung (không giữ text con) — tránh rò script/style/markup thực thi.
const DROP_CONTENT = new Set([
  'SCRIPT', 'STYLE', 'SVG', 'MATH', 'IFRAME', 'NOSCRIPT', 'TEMPLATE', 'OBJECT', 'EMBED', 'LINK', 'META', 'HEAD',
])

const esc = (s: string) =>
  s.replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'))

// Escape cho giá trị attribute (thêm " so với esc text).
const attrEsc = (s: string) =>
  s.replace(/[<>&"]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : '&quot;'))

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

function walk(node: Node, allowImg: boolean): string {
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
      } else if (allowImg && raw === 'IMG') {
        // Chỉ giữ ảnh có src thuộc storage allowlist công khai; src lạ → bỏ hẳn (khớp server tip-html).
        const src = el.getAttribute('src') ?? ''
        if (isAllowedPublicMediaUrl(src)) {
          const alt = el.getAttribute('alt') ?? ''
          out += `<img src="${attrEsc(src)}"${alt ? ` alt="${attrEsc(alt)}"` : ''}>`
        }
      } else if (ALLOWED_TAGS.has(tag)) {
        const style = sanitizeStyle(el.getAttribute('style') ?? '')
        const t = tag.toLowerCase()
        out += style ? `<${t} style="${style}">${walk(el, allowImg)}</${t}>` : `<${t}>${walk(el, allowImg)}</${t}>`
      } else {
        // Thẻ không cho phép nhưng không nguy hiểm (a/table…) → bỏ THẺ, GIỮ text con (giống discard server).
        out += walk(el, allowImg)
      }
    }
  })
  return out
}

function run(html: unknown, allowImg: boolean): string {
  if (typeof html !== 'string' || html.trim() === '') return ''
  if (typeof DOMParser === 'undefined') return '' // SSR: nội dung chỉ xuất hiện client-side (admin import/preview)
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return walk(doc.body, allowImg)
}

// Passage đề thi — KHÔNG ảnh (chính sách cũ). Rỗng/không phải string → ''.
export function sanitizePassageHtmlClient(html: unknown): string {
  return run(html, false)
}

// Bài Tips — cho phép <img> src thuộc storage allowlist (khớp server sanitizeTipHtml).
export function sanitizeTipHtmlClient(html: unknown): string {
  return run(html, true)
}
