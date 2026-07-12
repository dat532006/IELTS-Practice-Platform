import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminApi } from '@/lib/admin/guard'
import { ok, fail } from '@/lib/api/response'
import { isUuid } from '@/lib/utils'

// POST /api/admin/users/[id]/coins — chỉnh coin thủ công (M11 mở rộng, 2026-07-12).
// LUẬT THÉP tiền: đi qua RPC admin_adjust_coins (atomic conditional update, KHÔNG âm được,
//   LUÔN ghi transactions kèm note lý do) — không bao giờ update coins trực tiếp từ route.
const Body = z
  .object({
    delta: z.number().int().refine((v) => v !== 0, 'delta phải khác 0').refine((v) => Math.abs(v) <= 100_000, 'delta tối đa 100.000'),
    reason: z.string().trim().min(3, 'Lý do tối thiểu 3 ký tự').max(500),
  })
  .strict()

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdminApi()
  if (!g.ok) return g.res
  const { id } = await params
  if (!isUuid(id)) return fail('NOT_FOUND', 'Không tìm thấy tài khoản', { status: 404 })

  let raw: unknown
  try { raw = await request.json() } catch { return fail('VALIDATION_ERROR', 'Body JSON không hợp lệ', { status: 400 }) }
  const parsed = Body.safeParse(raw)
  if (!parsed.success) return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ', { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('admin_adjust_coins', {
    p_user_id: id,
    p_delta: parsed.data.delta,
    p_note: parsed.data.reason,
  })
  if (error) return fail('INTERNAL', 'Không chỉnh được coin', { status: 500 })

  const row = (data ?? {}) as { status?: string; coins?: number }
  if (row.status === 'USER_NOT_FOUND') return fail('NOT_FOUND', 'Không tìm thấy tài khoản', { status: 404 })
  if (row.status === 'INSUFFICIENT_COINS')
    return fail('INSUFFICIENT_COINS', 'Số dư không đủ để trừ mức này', { status: 409 })
  if (row.status !== 'OK') return fail('VALIDATION_ERROR', 'Mức chỉnh không hợp lệ', { status: 400 })
  return ok({ user_id: id, coins: row.coins ?? 0, delta: parsed.data.delta })
}
