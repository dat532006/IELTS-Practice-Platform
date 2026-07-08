import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/auth/guards'
import { ok, fail } from '@/lib/api/response'

// A1-alt — GET /api/payment/status?ref=TOPUP-xxx: trạng thái topup CỦA CHÍNH USER (poll ở trang QR).
//   Owner-guard: chỉ trả giao dịch user_id = session user. Chỉ metadata trạng thái — KHÔNG secret.
const RefSchema = z.string().regex(/^TOPUP-[0-9a-f]{18}$/)

export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) return fail('UNAUTHORIZED', 'Bạn cần đăng nhập', { status: 401 })

  const ref = new URL(request.url).searchParams.get('ref') ?? ''
  if (!RefSchema.safeParse(ref).success) return fail('VALIDATION_ERROR', 'Mã giao dịch không hợp lệ', { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('transactions')
    .select('status, amount_vnd, amount_coins, expires_at')
    .eq('provider_txn_id', ref)
    .eq('user_id', user.id) // owner-only
    .eq('type', 'topup')
    .maybeSingle()
  if (error) return fail('INTERNAL', 'Không đọc được trạng thái', { status: 500 })
  if (!data) return fail('NOT_FOUND', 'Không tìm thấy giao dịch', { status: 404 })

  return ok({
    ref,
    status: data.status,
    amount_vnd: data.amount_vnd,
    amount_coins: data.amount_coins,
    expires_at: data.expires_at,
  })
}
