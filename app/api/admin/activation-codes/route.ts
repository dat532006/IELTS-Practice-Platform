import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminApi } from '@/lib/admin/guard'
import { generateActivationCodes, codesToCsv } from '@/lib/admin/activation-codes'
import { ok, fail } from '@/lib/api/response'

// POST /api/admin/activation-codes — sinh + export mã kích hoạt (M08/M11, W14).
// LUẬT THÉP: requireAdmin TRƯỚC; chỉ lưu code_hash (HMAC + pepper server-only); plaintext trả 1 LẦN.
//   Redeem (tiêu mã) = W15. KHÔNG endpoint đọc lại plaintext.
export async function POST(request: Request) {
  const g = await requireAdminApi()
  if (!g.ok) return g.res
  let raw: unknown
  try { raw = await request.json() } catch { return fail('VALIDATION_ERROR', 'Body JSON không hợp lệ', { status: 400 }) }

  const res = await generateActivationCodes(createAdminClient(), raw)
  if (!res.ok) {
    if (res.code === 'NOT_CONFIGURED') return fail('ACTIVATION_NOT_CONFIGURED', 'Chưa cấu hình ACTIVATION_CODE_PEPPER (server)', { status: 503 })
    if (res.code === 'VALIDATION_ERROR') return fail('VALIDATION_ERROR', res.detail ?? 'Dữ liệu không hợp lệ', { status: 400 })
    return fail('INTERNAL', 'Không sinh được mã kích hoạt', { status: 500 })
  }

  // Export CSV 1 lần (file tải về) — plaintext chỉ ở đây.
  const format = (raw as { format?: unknown })?.format
  if (format === 'csv') {
    return new Response(codesToCsv(res.product_id, res.codes), {
      status: 201,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="activation-codes-${res.product_id}.csv"`,
      },
    })
  }

  // JSON: plaintext `code` trả 1 lần (KHÔNG code_hash, KHÔNG pepper).
  return ok({ product_id: res.product_id, generated: res.codes.length, codes: res.codes }, { status: 201 })
}
