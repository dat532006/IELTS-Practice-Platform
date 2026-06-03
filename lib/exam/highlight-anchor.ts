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
  style.textContent = '::highlight(exam-highlight){background-color:#fde68a;color:inherit;}'
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
