import 'server-only'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hashActivationCode, isActivationConfigured } from '@/lib/crypto/activation'

// W15 — Redeem orchestration (M08). SERVER-ONLY. Theo payment_redeem_contract §2.
//   normalize+HMAC (W14 lib) → RPC redeem_activation_code (atomic, service_role) → map status.
//   Unlock + expand test_unlocks nằm trong RPC. KHÔNG trả code_hash/pepper.
export const RedeemSchema = z.object({ code: z.string().min(1).max(100) })

export type RedeemOutcome =
  | { ok: true; status: 'unlocked' | 'already_unlocked'; product_id: string }
  | { ok: false; code: 'CODE_NOT_FOUND' | 'CODE_DISABLED' | 'CODE_EXPIRED' | 'CODE_SOLD_OUT' | 'VALIDATION_ERROR' | 'INTERNAL'; detail?: string }

export async function redeemCode(admin: SupabaseClient, userId: string, raw: unknown): Promise<RedeemOutcome> {
  const parsed = RedeemSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, code: 'VALIDATION_ERROR', detail: parsed.error.issues[0]?.message }
  if (!isActivationConfigured()) return { ok: false, code: 'INTERNAL', detail: 'ACTIVATION_CODE_PEPPER not set' }

  const codeHash = hashActivationCode(parsed.data.code) // normalize bên trong → khớp generation (W14)
  const { data, error } = await admin.rpc('redeem_activation_code', { p_user_id: userId, p_code_hash: codeHash })
  if (error) return { ok: false, code: 'INTERNAL', detail: error.message }

  const row = (data ?? {}) as { status?: string; product_id?: string }
  switch (row.status) {
    case 'OK': return { ok: true, status: 'unlocked', product_id: row.product_id as string }
    case 'already_unlocked': return { ok: true, status: 'already_unlocked', product_id: row.product_id as string }
    case 'CODE_NOT_FOUND': return { ok: false, code: 'CODE_NOT_FOUND' }
    case 'CODE_DISABLED': return { ok: false, code: 'CODE_DISABLED' }
    case 'CODE_EXPIRED': return { ok: false, code: 'CODE_EXPIRED' }
    case 'CODE_SOLD_OUT': return { ok: false, code: 'CODE_SOLD_OUT' }
    default: return { ok: false, code: 'INTERNAL', detail: `unexpected status ${row.status}` }
  }
}
