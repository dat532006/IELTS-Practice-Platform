import 'server-only'
import { createClient } from '@supabase/supabase-js'

// 🔐🔐 SERVICE-ROLE CLIENT — BYPASSES RLS.
// - CHỈ dùng trong route handler / server action / RPC nội bộ.
// - KHÔNG bao giờ import từ client component ('server-only' sẽ chặn build nếu lỡ import).
// - Dùng để: đọc answer_keys, chấm điểm, ghi ledger/unlock, redeem, refresh matview...
// - SUPABASE_SERVICE_ROLE_KEY là server env secret, KHÔNG prefix NEXT_PUBLIC_.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Thiếu SUPABASE service env (URL / SERVICE_ROLE_KEY)')
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
