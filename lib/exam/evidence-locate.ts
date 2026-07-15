// ============================================================
// EXAM-006 — Evidence locator (khử trùng quote).
// Bug: rangeFromQuote dùng RegExp.exec → CHỈ khớp lần ĐẦU. Quote trùng (heading/đoạn lặp) → tô evidence
//   SAI chỗ, không phân biệt được. Không có occurrence/context để chọn đúng lần.
// Owner chốt (2026-07-15): mở rộng evidence thành {quote, occurrence?, context_before?, context_after?}.
//   • quote duy nhất → tô như cũ (không regression).
//   • quote trùng + occurrence (1-based) → chọn đúng lần.
//   • quote trùng + context_before/after → chọn lần có ngữ cảnh khớp.
//   • quote trùng & KHÔNG khử được → SKIP (null) — thà không tô còn hơn tô nhầm.
// Thuần (không DOM/không import runtime) → highlight-anchor.ts (DOM) gọi lại; Node smoke test trực tiếp.
// ============================================================

export type EvidenceDescriptor = {
  quote: string
  occurrence?: number // 1-based, lần xuất hiện muốn tô
  context_before?: string // đoạn NGAY TRƯỚC quote (khử trùng)
  context_after?: string // đoạn NGAY SAU quote
}

export type QuoteMatch = { start: number; end: number }

const collapse = (s: string) => s.trim().replace(/[\s ]+/g, ' ')

// Chuẩn hóa evidence: string (legacy) → {quote}; object → giữ occurrence/context. Rỗng/không hợp lệ → null.
export function normalizeEvidence(raw: unknown): EvidenceDescriptor | null {
  if (typeof raw === 'string') {
    const q = raw.trim()
    return q ? { quote: q } : null
  }
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    const quote = typeof o.quote === 'string' ? o.quote.trim() : ''
    if (!quote) return null
    const out: EvidenceDescriptor = { quote }
    if (typeof o.occurrence === 'number' && Number.isInteger(o.occurrence) && o.occurrence > 0) out.occurrence = o.occurrence
    if (typeof o.context_before === 'string' && o.context_before.trim()) out.context_before = o.context_before.trim()
    if (typeof o.context_after === 'string' && o.context_after.trim()) out.context_after = o.context_after.trim()
    return out
  }
  return null
}

// Tìm MỌI lần xuất hiện của quote trong text (khoảng trắng linh hoạt như highlight cũ). Vị trí theo text thô.
function allMatches(text: string, quote: string): QuoteMatch[] {
  const q = collapse(quote)
  if (q.length < 3) return []
  const pattern = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[\\s\\u00a0]+')
  const re = new RegExp(pattern, 'g')
  const out: QuoteMatch[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length })
    if (m.index === re.lastIndex) re.lastIndex++ // tránh vòng lặp vô hạn với match rỗng (không xảy ra vì len≥3)
  }
  return out
}

// Trả vị trí quote cần tô, hoặc null (không tìm thấy HOẶC trùng mà không khử được → không tô nhầm).
export function locateQuote(text: string, ev: EvidenceDescriptor): QuoteMatch | null {
  const matches = allMatches(text, ev.quote)
  if (matches.length === 0) return null
  if (matches.length === 1) return matches[0]

  // Trùng → cần khử. Ưu tiên occurrence (1-based).
  if (ev.occurrence != null) return matches[ev.occurrence - 1] ?? null

  // Rồi tới context: đoạn trước kết thúc bằng context_before, đoạn sau bắt đầu bằng context_after.
  if (ev.context_before || ev.context_after) {
    const cb = ev.context_before ? collapse(ev.context_before) : null
    const ca = ev.context_after ? collapse(ev.context_after) : null
    for (const m of matches) {
      const beforeOk = !cb || collapse(text.slice(0, m.start)).endsWith(cb)
      const afterOk = !ca || collapse(text.slice(m.end)).startsWith(ca)
      if (beforeOk && afterOk) return m
    }
    return null
  }

  // Trùng & không có cách khử → SKIP (thà không tô còn hơn tô nhầm lần đầu — hành vi cũ sai).
  return null
}
