import { z } from 'zod'

// ============================================================
// W8 — Highlight anchor schema (M05 §"Highlight & Note Anchor").
// FIX (Leader review P1/P2): highlights là dữ liệu user-controlled được echo lại ở GET /api/result.
//   Nếu nhận `z.array(z.unknown())` → user nhồi {answer_keys, points, match,...} → result response
//   chứa key cấm (thủng whitelist LUẬT THÉP #2). → Schema STRICT (reject unknown key) + sanitize output.
//
// Anchor theo node-path (M05): startPath/startOffset/endPath/endOffset + quote (verify) + meta UI.
//   `.strict()` → key lạ ⇒ validation fail (route trả 400); FE restore luôn nhận shape dùng được.
// ============================================================

export const HighlightAnchorSchema = z
  .object({
    id: z.string().max(64).optional(),
    startPath: z.string().min(1).max(256),
    startOffset: z.number().int().min(0).max(1_000_000),
    endPath: z.string().min(1).max(256),
    endOffset: z.number().int().min(0).max(1_000_000),
    quote: z.string().max(2000).optional(),
    color: z.string().max(32).optional(),
    note: z.string().max(2000).optional(),
    createdAt: z.union([z.string().max(40), z.number()]).optional(),
  })
  .strict() // ⛔ reject key ngoài whitelist (vd answer_keys/points/match)

export type HighlightAnchor = z.infer<typeof HighlightAnchorSchema>

export const HighlightsSchema = z.array(HighlightAnchorSchema).max(500)

// Defense-in-depth: lọc về đúng shape khi ĐỌC (vd dữ liệu cũ/bất thường) → result KHÔNG bao giờ echo key lạ.
export function sanitizeHighlights(value: unknown): HighlightAnchor[] {
  if (!Array.isArray(value)) return []
  const out: HighlightAnchor[] = []
  for (const item of value) {
    const parsed = HighlightAnchorSchema.safeParse(item)
    if (parsed.success) out.push(parsed.data)
  }
  return out
}
