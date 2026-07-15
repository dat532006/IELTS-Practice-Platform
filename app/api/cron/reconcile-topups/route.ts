import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { ok, fail } from '@/lib/api/response'

// GET /api/cron/reconcile-topups — W19 (M08/M12): reconciliation job cho topup pending quá hạn.
// Gọi bởi Vercel Cron (vercel.json) theo lịch; Vercel tự đính kèm `Authorization: Bearer $CRON_SECRET`.
//
// LUẬT THÉP:
//   - KHÔNG mở endpoint privileged mà không có auth: nếu CRON_SECRET chưa set → 503 (từ chối chạy).
//   - Auth bằng bearer CRON_SECRET (so sánh timing-safe), KHÔNG dùng session admin (cron không có cookie).
//   - Chỉ gọi expire_pending_topups (service_role RPC): pending + expires_at < now() → status='expired' (B-03).
//     TUYỆT ĐỐI KHÔNG cộng coin ở đây — credit CHỈ ở webhook sau verify chữ ký + số tiền.
//   - Idempotent: chạy lại nhiều lần an toàn (chỉ đụng pending quá hạn) → overlap 2 run song song vô hại
//     (run sau thấy đã 'expired', không còn pending). Recovery: miss/lỗi 1 lần → run kế tiếp tự dọn nốt
//     (không cần retry riêng vì idempotent theo trạng thái, KHÔNG theo thời điểm).
//   - DEPLOY-001: mỗi lần chạy ghi audit bền vào cron_runs (best-effort) → thất bại/miss quan sát được;
//     alert/dashboard dựa trên bảng này = Owner.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Ghi audit run (best-effort). Audit lỗi KHÔNG được làm hỏng job → nuốt lỗi tại đây.
async function recordRun(admin: ReturnType<typeof createAdminClient>, ok: boolean, detail: Record<string, unknown>) {
  try { await admin.from('cron_runs').insert({ job: 'reconcile-topups', ok, detail }) } catch { /* audit best-effort */ }
}

function bearerMatches(header: string | null, secret: string): boolean {
  if (!header) return false
  const prefix = 'Bearer '
  const token = header.startsWith(prefix) ? header.slice(prefix.length) : header
  const a = Buffer.from(token)
  const b = Buffer.from(secret)
  if (a.length !== b.length) return false // timingSafeEqual yêu cầu cùng độ dài
  return timingSafeEqual(a, b)
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    // Không cấu hình secret → không cho chạy job privileged (fail closed).
    return fail('INTERNAL', 'CRON_SECRET chưa cấu hình', { status: 503 })
  }
  if (!bearerMatches(request.headers.get('authorization'), secret)) {
    return fail('UNAUTHORIZED', 'Cron token không hợp lệ', { status: 401 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('expire_pending_topups')
  if (error) {
    await recordRun(admin, false, { error_code: error.code ?? null }) // KHÔNG log message chi tiết (an toàn)
    return fail('INTERNAL', 'Không dọn được giao dịch quá hạn', { status: 500 })
  }

  const expired = (data as { expired?: number } | null)?.expired ?? 0
  await recordRun(admin, true, { expired })
  return ok({ expired })
}
