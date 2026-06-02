import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

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
    .eq('product_id', productId)
    .limit(1)
  if (error) throw new Error(error.message)
  return (data?.length ?? 0) > 0
}

// 🔐 Audio Listening: signed URL CHỈ cấp SAU khi guard pass (M03 / LUẬT THÉP #3).
// R2 chưa wired ở W4 → trả null (placeholder). Khi M03 đủ: sinh signed URL từ R2 tại đây.
export function getSignedAudioUrl(_test: { id: string; type: string }): string | null {
  return null
}
