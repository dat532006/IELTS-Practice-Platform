// W8 — Highlight anchor (M05 §"Highlight & Note Anchor"). CLIENT DOM helpers.
// Node-path thay vì plain offset (bền khi có <input> inline / reload). Restore verify `quote`; lệch → skip.
// Field PHẢI khớp BE strict schema (lib/exam/highlights.ts): id/startPath/startOffset/endPath/endOffset/quote/color/note/createdAt.

export type HighlightAnchor = {
  id?: string
  startPath: string
  startOffset: number
  endPath: string
  endOffset: number
  quote?: string
  color?: string
  note?: string
  passageId?: string // W9: scope theo passage (đa passage / switching). Khớp BE strict schema.
  createdAt?: string
}

// Chuỗi index con từ root → node (vd "0/2/0"). root chính nó → "".
function pathOf(root: Node, node: Node): string | null {
  const idx: number[] = []
  let cur: Node | null = node
  while (cur && cur !== root) {
    const parent: Node | null = cur.parentNode
    if (!parent) return null
    idx.unshift(Array.prototype.indexOf.call(parent.childNodes, cur))
    cur = parent
  }
  if (cur !== root) return null
  return idx.join('/')
}

function nodeFromPath(root: Node, path: string): Node | null {
  if (path === '') return root
  let cur: Node = root
  for (const seg of path.split('/')) {
    const i = Number(seg)
    const child = cur.childNodes[i]
    if (!child) return null
    cur = child
  }
  return cur
}

// Build anchor từ Range hiện tại (selection trong root). null nếu range không nằm trong root.
export function anchorFromRange(root: Node, range: Range): HighlightAnchor | null {
  if (range.collapsed) return null
  const startPath = pathOf(root, range.startContainer)
  const endPath = pathOf(root, range.endContainer)
  if (startPath == null || endPath == null) return null
  const quote = range.toString().slice(0, 2000)
  if (quote.trim() === '') return null
  return {
    startPath,
    startOffset: range.startOffset,
    endPath,
    endOffset: range.endOffset,
    quote,
  }
}

// Dựng Range từ anchor + VERIFY quote. Lệch/không dựng được → null (skip an toàn, KHÔNG throw).
export function rangeFromAnchor(root: Node, a: HighlightAnchor): Range | null {
  try {
    const startNode = nodeFromPath(root, a.startPath)
    const endNode = nodeFromPath(root, a.endPath)
    if (!startNode || !endNode) return null
    const range = document.createRange()
    range.setStart(startNode, a.startOffset)
    range.setEnd(endNode, a.endOffset)
    if (a.quote != null && range.toString().trim() !== a.quote.trim()) return null // quote mismatch → skip
    return range
  } catch {
    return null
  }
}

// Range hiện tại có nằm hoàn toàn trong root không (chặn selection ngoài passage).
export function rangeWithinRoot(root: Node, range: Range): boolean {
  return root.contains(range.startContainer) && root.contains(range.endContainer)
}

const HL_NAME = 'exam-highlight'

// Cấu trúc tối thiểu của CSS Custom Highlight API (không phụ thuộc lib.dom version).
type HighlightCtor = new (...ranges: Range[]) => unknown
type HighlightRegistry = { set(name: string, h: unknown): void; delete(name: string): void }
function getHighlightApi(): { Ctor: HighlightCtor; reg: HighlightRegistry } | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { Highlight?: HighlightCtor; CSS?: { highlights?: HighlightRegistry } }
  if (typeof w.Highlight !== 'function' || !w.CSS?.highlights) return null
  return { Ctor: w.Highlight, reg: w.CSS.highlights }
}

// Inject `::highlight()` rule lúc RUNTIME (chỉ ở browser hỗ trợ API) — tránh build CSS optimizer
// (lightningcss) cảnh báo pseudo-element `::highlight` không nhận diện (FIX Leader P3).
function ensureHighlightStyle(): void {
  if (typeof document === 'undefined' || document.getElementById('exam-hl-style')) return
  const style = document.createElement('style')
  style.id = 'exam-hl-style'
  // W9 parity (T1.1): nền maroon + chữ trắng (khớp reference realieltsexams.com) → tương phản ≥7:1
  //   ở cả 3 contrast (bw/wb/yb). Trước đây amber nhạt + inherit gây chữ chìm ở dark mode.
  style.textContent = '::highlight(exam-highlight){background-color:#7b1e1e;color:#ffffff;}'
  document.head.appendChild(style)
}

// Render tất cả highlight bằng CSS Custom Highlight API (KHÔNG mutate DOM → bền khi re-render).
// Không hỗ trợ API → no-op (vẫn persist; degrade — không tô).
export function applyHighlights(root: Node, anchors: HighlightAnchor[]): void {
  const hl = getHighlightApi()
  if (!hl) return
  ensureHighlightStyle()
  const ranges: Range[] = []
  for (const a of anchors) {
    const r = rangeFromAnchor(root, a)
    if (r) ranges.push(r)
  }
  if (ranges.length === 0) {
    hl.reg.delete(HL_NAME)
    return
  }
  hl.reg.set(HL_NAME, new hl.Ctor(...ranges))
}

export function clearHighlights(): void {
  getHighlightApi()?.reg.delete(HL_NAME)
}

export function newAnchorId(): string {
  return 'hl_' + Math.random().toString(36).slice(2, 10)
}

// W9 (F-c): hit-test — click trong passage rơi vào highlight nào? (KHÔNG bọc <mark> → giữ độ bền anchor).
//   Dùng caret position tại điểm click → so với từng anchor range. Ưu tiên highlight tạo SAU (chồng lên trên).
export function highlightAtPoint(root: Node, anchors: HighlightAnchor[], x: number, y: number): HighlightAnchor | null {
  const doc = (root.ownerDocument || (typeof document !== 'undefined' ? document : null)) as Document | null
  if (!doc) return null
  const d = doc as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }
  let node: Node | null = null
  let off = 0
  if (typeof d.caretRangeFromPoint === 'function') {
    const c = d.caretRangeFromPoint(x, y)
    if (c) {
      node = c.startContainer
      off = c.startOffset
    }
  } else if (typeof d.caretPositionFromPoint === 'function') {
    const p = d.caretPositionFromPoint(x, y)
    if (p) {
      node = p.offsetNode
      off = p.offset
    }
  }
  if (!node || !root.contains(node)) return null
  for (let i = anchors.length - 1; i >= 0; i--) {
    const r = rangeFromAnchor(root, anchors[i])
    if (!r) continue
    try {
      if (r.comparePoint(node, off) === 0) return anchors[i]
    } catch {
      /* node ngoài range → bỏ qua */
    }
  }
  return null
}

// W9 parity (T2.3): vị trí icon note (bong bóng) cho highlight CÓ note — đặt cuối range.
//   Toạ độ TƯƠNG ĐỐI so với `root` (đã trừ rootRect) → render marker absolute là con của root → cuộn cùng nội dung.
export function noteMarkerPositions(root: HTMLElement, anchors: HighlightAnchor[]): { id: string; left: number; top: number }[] {
  const rootRect = root.getBoundingClientRect()
  const out: { id: string; left: number; top: number }[] = []
  for (const a of anchors) {
    if (!a.id || !a.note) continue
    const r = rangeFromAnchor(root, a)
    if (!r) continue
    const rects = r.getClientRects()
    const last = rects[rects.length - 1]
    if (!last) continue
    out.push({ id: a.id, left: last.right - rootRect.left, top: last.top - rootRect.top })
  }
  return out
}

// ============================================================
// 2026-07-12 — Evidence highlight (review-in-exam). Admin chỉ lưu QUOTE (trích nguyên văn),
//   KHÔNG có node-path → tìm text-match trong text node stream của passage → dựng Range.
//   Whitespace-flexible (mọi run khoảng trắng coi như nhau); không thấy → null (skip êm).
// ============================================================

type TextIndex = { text: string; map: { node: Text; start: number }[] }

// Ghép toàn bộ text node dưới root thành 1 chuỗi + bảng map vị trí → (node, offset).
function buildTextIndex(root: Node): TextIndex {
  const doc = root.ownerDocument ?? (typeof document !== 'undefined' ? document : null)
  const map: { node: Text; start: number }[] = []
  let text = ''
  if (!doc) return { text, map }
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let n: Node | null
  while ((n = walker.nextNode())) {
    const t = n as Text
    map.push({ node: t, start: text.length })
    text += t.data
  }
  return { text, map }
}

function posToNodeOffset(idx: TextIndex, pos: number): { node: Text; offset: number } | null {
  for (let i = idx.map.length - 1; i >= 0; i--) {
    const m = idx.map[i]
    if (pos >= m.start) {
      const offset = Math.min(pos - m.start, m.node.data.length)
      return { node: m.node, offset }
    }
  }
  return null
}

// Tìm quote trong root (case-sensitive, khoảng trắng linh hoạt) → Range. Không thấy/lỗi → null.
export function rangeFromQuote(root: Node, quote: string): Range | null {
  const q = quote.trim().replace(/\s+/g, ' ')
  if (q.length < 3) return null
  try {
    const idx = buildTextIndex(root)
    if (!idx.text) return null
    // Regex từ quote đã escape, mỗi khoảng trắng → \s+ (khớp xuống dòng/nbsp trong DOM).
    const pattern = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[\\s\\u00a0]+')
    const m = new RegExp(pattern).exec(idx.text)
    if (!m) return null
    const start = posToNodeOffset(idx, m.index)
    const end = posToNodeOffset(idx, m.index + m[0].length)
    if (!start || !end) return null
    const range = (root.ownerDocument ?? document).createRange()
    range.setStart(start.node, start.offset)
    range.setEnd(end.node, end.offset)
    return range
  } catch {
    return null
  }
}

const EV_NAME = 'exam-evidence'

function ensureEvidenceStyle(): void {
  if (typeof document === 'undefined' || document.getElementById('exam-ev-style')) return
  const style = document.createElement('style')
  style.id = 'exam-ev-style'
  // Xanh lá đậm + chữ trắng — phân biệt highlight maroon của thí sinh; contrast ≥7:1 cả 3 theme.
  style.textContent = '::highlight(exam-evidence){background-color:#0E7A43;color:#ffffff;}'
  document.head.appendChild(style)
}

export type EvidenceItem = { number?: number; quote: string }

// Tô mọi evidence tìm thấy trong root (registry riêng 'exam-evidence' — không đụng highlight thí sinh).
export function applyEvidenceHighlights(root: Node, items: EvidenceItem[]): void {
  const hl = getHighlightApi()
  if (!hl) return
  ensureEvidenceStyle()
  const ranges: Range[] = []
  for (const it of items) {
    const r = rangeFromQuote(root, it.quote)
    if (r) ranges.push(r)
  }
  if (ranges.length === 0) {
    hl.reg.delete(EV_NAME)
    return
  }
  hl.reg.set(EV_NAME, new hl.Ctor(...ranges))
}

export function clearEvidenceHighlights(): void {
  getHighlightApi()?.reg.delete(EV_NAME)
}

// Vị trí badge số câu [n] — đặt ĐẦU range (góc trên-trái), tọa độ tương đối root như noteMarkerPositions.
export function evidenceMarkerPositions(
  root: HTMLElement,
  items: EvidenceItem[],
): { number: number; left: number; top: number }[] {
  const rootRect = root.getBoundingClientRect()
  const out: { number: number; left: number; top: number }[] = []
  for (const it of items) {
    if (typeof it.number !== 'number') continue
    const r = rangeFromQuote(root, it.quote)
    if (!r) continue
    const first = r.getClientRects()[0]
    if (!first) continue
    out.push({ number: it.number, left: first.left - rootRect.left, top: first.top - rootRect.top })
  }
  return out
}
