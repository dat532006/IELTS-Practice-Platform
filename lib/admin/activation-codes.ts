import 'server-only'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  generateActivationCode,
  hashActivationCode,
  isActivationConfigured,
  codePrefix,
  codeLast4,
} from '@/lib/crypto/activation'

// ============================================================
// W14 — Activation code generation orchestration (M08/M11). SERVER-ONLY.
// LUẬT THÉP: chỉ lưu `code_hash` (HMAC + pepper) — KHÔNG plaintext. Plaintext trả 1 lần.
//   Mutation qua service_role SAU requireAdmin (route lo guard). Redeem (tiêu mã) = W15.
// ============================================================

export const GenerateCodesSchema = z.object({
  product_id: z.string().uuid(),
  count: z.number().int().min(1).max(1000),
  max_redemptions: z.number().int().min(1).max(100_000).default(1),
  expires_at: z.string().datetime().optional(),
  format: z.enum(['json', 'csv']).optional(),
})
export type GenerateCodesInput = z.infer<typeof GenerateCodesSchema>

// Plaintext chỉ trả 1 lần ở response sinh — KHÔNG bao giờ lưu/đọc lại.
export type GeneratedCode = { code: string; code_prefix: string; code_last4: string; expires_at: string | null }

export type GenerateOutcome =
  | { ok: true; product_id: string; codes: GeneratedCode[] }
  | { ok: false; code: 'VALIDATION_ERROR' | 'NOT_CONFIGURED' | 'INTERNAL'; detail?: string }

export async function generateActivationCodes(admin: SupabaseClient, raw: unknown): Promise<GenerateOutcome> {
  // Pepper chưa cấu hình → KHÔNG sinh (tránh hash sai/rỗng). 503.
  if (!isActivationConfigured()) return { ok: false, code: 'NOT_CONFIGURED' }

  const parsed = GenerateCodesSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, code: 'VALIDATION_ERROR', detail: parsed.error.issues[0]?.message }
  const { product_id, count, max_redemptions, expires_at } = parsed.data

  // Chỉ sinh mã cho product TỒN TẠI (FK cũng chặn, nhưng trả lỗi rõ trước).
  const { data: product } = await admin.from('products').select('id').eq('id', product_id).maybeSingle()
  if (!product) return { ok: false, code: 'VALIDATION_ERROR', detail: 'product_id không tồn tại' }

  const codes: GeneratedCode[] = []
  const rows: Array<Record<string, unknown>> = []
  for (let i = 0; i < count; i++) {
    const { display, canonical } = generateActivationCode()
    const prefix = codePrefix(canonical)
    const last4 = codeLast4(canonical)
    codes.push({ code: display, code_prefix: prefix, code_last4: last4, expires_at: expires_at ?? null })
    rows.push({
      code_hash: hashActivationCode(canonical), // HMAC(normalize) — KHÔNG lưu plaintext
      code_prefix: prefix,
      code_last4: last4,
      product_id,
      status: 'active',
      max_redemptions,
      expires_at: expires_at ?? null,
    })
  }

  const { error } = await admin.from('activation_codes').insert(rows)
  if (error) {
    // 23505 = trùng code_hash (xác suất ~0 với 80-bit) → báo thử lại, KHÔNG lưu nửa vời.
    if (error.code === '23505') return { ok: false, code: 'INTERNAL', detail: 'trùng code_hash hiếm gặp — thử lại' }
    return { ok: false, code: 'INTERNAL', detail: error.message }
  }
  return { ok: true, product_id, codes }
}

// CSV export 1 lần (code + product + expiry). Plaintext chỉ ở đây — KHÔNG endpoint đọc lại.
export function codesToCsv(productId: string, codes: GeneratedCode[]): string {
  const header = 'code,product_id,expires_at'
  const lines = codes.map((c) => `${c.code},${productId},${c.expires_at ?? ''}`)
  return [header, ...lines].join('\r\n') + '\r\n'
}
