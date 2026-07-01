import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signR2GetUrl } from '@/lib/storage/r2'

// ============================================================
// W4 — Access boundary helpers (M05/M03).
//
// 🔑 RULE TRUY CẬP DUY NHẤT (dùng chung cho exam payload, pre-exam meta, product detail):
//      unlocked(test) = test.is_free OR exists(test_unlocks[user, test])
//      locked(test)   = NOT unlocked(test)
//   LUẬT THÉP #3 / security_rls_contract §3 / api_contract §3: chỉ is_free | test_unlocks.
//   `product_unlocks` (hasProductUnlock) CHỈ là cờ sở hữu bundle cho UI — KHÔNG mở payload.
//   Khi mua product, checkout (M08) expand product_unlocks → test_unlocks; guard chỉ tin test_unlocks.
//
// `test_unlocks` đọc qua client RLS của user → user chỉ thấy unlock của CHÍNH MÌNH
//   (policy W1+2 `test_unlocks_select_own`). Không tin client gửi.
//
// 🛡️ DEFENSE-IN-DEPTH (review R1): cả 3 helper LỌC `.eq('user_id', userId)` TRỰC TIẾP trong query —
//   KHÔNG chỉ dựa vào caller truyền đúng RLS client. security_rls_contract §3 quy định guard =
//   `is_free OR test_unlocks(user_id, test_id)` (CÓ user_id). Nếu lỡ truyền admin (service_role,
//   BYPASSRLS) — như chính route exam đã có sẵn `admin` — mà query không có user_id thì sẽ trả unlock
//   của NGƯỜI KHÁC → bypass cổng premium. Có `.eq('user_id')` → đúng bất kể client nào.
// ============================================================

// 1 test: user có test_unlocks không? (caller tự cộng điều kiện is_free.)
export async function hasTestUnlock(
  supabase: SupabaseClient,
  testId: string,
  userId: string | null,
): Promise<boolean> {
  if (!userId) return false
  const { data, error } = await supabase
    .from('test_unlocks')
    .select('id')
    .eq('user_id', userId) // R1: user-scope tường minh (không chỉ dựa RLS client)
    .eq('test_id', testId)
    .limit(1)
  if (error) throw new Error(error.message)
  return (data?.length ?? 0) > 0
}

// Nhiều test (product detail): tập test_id user đã unlock trong danh sách.
export async function getUnlockedTestIds(
  supabase: SupabaseClient,
  testIds: string[],
  userId: string | null,
): Promise<Set<string>> {
  if (!userId || testIds.length === 0) return new Set()
  const { data, error } = await supabase
    .from('test_unlocks')
    .select('test_id')
    .eq('user_id', userId) // R1: user-scope tường minh
    .in('test_id', testIds)
  if (error) throw new Error(error.message)
  return new Set((data ?? []).map((r) => (r as { test_id: string }).test_id))
}

// Product-level ownership (product_unlocks) — CHỈ cho cờ DTO `owned` (UI "đã sở hữu bundle").
// ⚠️ KHÔNG dùng cho payload guard: owned-mà-chưa-expand-test_unlocks vẫn phải locked (LUẬT THÉP #3).
export async function hasProductUnlock(
  supabase: SupabaseClient,
  productId: string,
  userId: string | null,
): Promise<boolean> {
  if (!userId) return false
  const { data, error } = await supabase
    .from('product_unlocks')
    .select('id')
    .eq('user_id', userId) // R1: user-scope tường minh
    .eq('product_id', productId)
    .limit(1)
  if (error) throw new Error(error.message)
  return (data?.length ?? 0) > 0
}

// 🔐 Audio Listening: signed URL CHỈ cấp SAU khi guard pass (M03 / LUẬT THÉP #3).
// W7: ký SigV4 từ R2 object key (tests.audio_key — server-only). Caller PHẢI đã pass guard
//   (is_free | test_unlocks) trước khi gọi. Trả { url, warning }:
//   - type != 'listening' → { null, null } (reading/writing không có audio)
//   - thiếu audio_key      → { null, 'AUDIO_KEY_MISSING' }
//   - thiếu R2 env         → { null, 'R2_NOT_CONFIGURED' } (fallback rõ — exam KHÔNG crash)
//   - đủ                   → { signed URL TTL ngắn, null }
// audio_key (raw object key) là SERVER-ONLY: chỉ dùng ở đây, KHÔNG trả ra client.
export type AudioUrlResult = { url: string | null; warning: string | null }
export function getSignedAudioUrl(test: { type: string; audio_key: string | null }): AudioUrlResult {
  if (test.type !== 'listening') return { url: null, warning: null }
  if (!test.audio_key) return { url: null, warning: 'AUDIO_KEY_MISSING' }
  return signR2GetUrl(test.audio_key)
}
