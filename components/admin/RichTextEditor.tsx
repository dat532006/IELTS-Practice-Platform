'use client'

import { useCallback, useEffect, useRef, type ClipboardEvent } from 'react'

// M11 — Trình soạn thảo passage kiểu Word (WYSIWYG). contentEditable + toolbar → xuất HTML.
//   CHỈ dùng ở form admin (client). An toàn thực thi do SERVER sanitize allowlist (lib/sanitize/passage-html)
//   trước khi HTML tới thí sinh; ở đây chỉ DỌN nội dung paste (từ Word/web) về bộ thẻ cho phép để soạn cho sạch.

const ALLOWED = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'H2', 'H3', 'UL', 'OL', 'LI'])
const esc = (s: string) => s.replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'))

// Dọn HTML dán vào → chỉ giữ thẻ cho phép + text; bỏ style/màu/font rác của Word.
function cleanPasted(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const walk = (node: Node): string => {
    let out = ''
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += esc(child.textContent ?? '')
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement
        const tag = el.tagName === 'DIV' ? 'P' : el.tagName
        const inner = walk(child)
        if (tag === 'BR') out += '<br>'
        else if (ALLOWED.has(tag)) out += `<${tag.toLowerCase()}>${inner}</${tag.toLowerCase()}>`
        else out += inner
      }
    })
    return out
  }
  return walk(doc.body)
}

// text thuần → các <p> theo dòng trống/xuống dòng (giữ đoạn khi dán text hoặc import draft).
export function plainToHtml(text: string): string {
  return text
    .split(/\n{2,}|\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `<p>${esc(s)}</p>`)
    .join('')
}

// Có "trông giống HTML" không (client-side, không đụng lib server-only) — để quyết định bọc <p> khi import.
export function looksRich(v: string): boolean {
  return /<(\/?)(p|br|strong|b|em|i|u|s|h2|h3|ul|ol|li|span|div)(\s|>|\/)/i.test(v)
}

type BtnDef = { cmd: string; arg?: string; label: string; title: string; bold?: boolean }
const BTNS: BtnDef[] = [
  { cmd: 'bold', label: 'B', title: 'Đậm (Ctrl+B)', bold: true },
  { cmd: 'italic', label: 'I', title: 'Nghiêng (Ctrl+I)' },
  { cmd: 'underline', label: 'U', title: 'Gạch chân (Ctrl+U)' },
  { cmd: 'formatBlock', arg: 'h2', label: 'Tiêu đề', title: 'Tiêu đề bài đọc — căn giữa, in đậm' },
  { cmd: 'formatBlock', arg: 'h3', label: 'Phụ đề', title: 'Phụ đề — căn giữa, chữ thường' },
  { cmd: 'formatBlock', arg: 'p', label: '¶', title: 'Đoạn văn thường' },
  { cmd: 'justifyLeft', label: '⯇', title: 'Căn trái' },
  { cmd: 'justifyCenter', label: '≡', title: 'Căn giữa' },
  { cmd: 'justifyFull', label: '☰', title: 'Căn đều 2 bên' },
  { cmd: 'insertUnorderedList', label: '• —', title: 'Danh sách chấm' },
  { cmd: 'insertOrderedList', label: '1.', title: 'Danh sách số' },
  { cmd: 'removeFormat', label: 'Xoá ĐD', title: 'Xoá định dạng vùng chọn' },
]

export function RichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const last = useRef<string>('')

  // Đồng bộ value NGOÀI (import/nạp draft) vào DOM — KHÔNG ghi đè khi đang gõ (giữ vị trí con trỏ).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p') // Enter tạo <p> thay <div> (Chrome)
      document.execCommand('styleWithCSS', false, 'false') // đậm/nghiêng → <b>/<i> ngữ nghĩa, không span-style
    } catch {
      /* execCommand không hỗ trợ → bỏ qua */
    }
    if (value !== last.current && value !== el.innerHTML) el.innerHTML = value || ''
  }, [value])

  const emit = useCallback(() => {
    const el = ref.current
    if (!el) return
    const html = el.innerHTML === '<br>' || el.innerHTML === '<p><br></p>' ? '' : el.innerHTML
    last.current = html
    onChange(html)
  }, [onChange])

  const run = (b: BtnDef) => {
    ref.current?.focus()
    try {
      document.execCommand(b.cmd, false, b.arg)
    } catch {
      /* no-op */
    }
    emit()
  }

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const html = e.clipboardData.getData('text/html')
    const text = e.clipboardData.getData('text/plain')
    const clean = html ? cleanPasted(html) : plainToHtml(text)
    try {
      document.execCommand('insertHTML', false, clean)
    } catch {
      /* no-op */
    }
    emit()
  }

  return (
    <div className="admin-rte">
      <div className="admin-rte-bar">
        {BTNS.map((b, i) => (
          <button
            key={i}
            type="button"
            title={b.title}
            onMouseDown={(e) => e.preventDefault()} // giữ vùng chọn trong editor khi bấm nút
            onClick={() => run(b)}
            className="admin-rte-btn"
            style={b.bold ? { fontWeight: 800 } : undefined}
          >
            {b.label}
          </button>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        onInput={emit}
        onBlur={emit}
        onPaste={onPaste}
        data-ph={placeholder}
        className="admin-rte-area"
      />
    </div>
  )
}
