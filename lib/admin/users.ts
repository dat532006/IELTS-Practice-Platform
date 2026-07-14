import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// ============================================================
// Admin user management (M11 mở rộng, 2026-07-12). SERVER-ONLY — chỉ gọi sau requireAdminApi.
// Đọc bằng service_role (bypass RLS có chủ đích cho admin); DTO chỉ chứa field nghiệp vụ,
// KHÔNG trả answer_keys/secret/token. Chỉnh coin đi qua RPC admin_adjust_coins (ledger bắt buộc);
// khóa tài khoản qua Supabase Auth ban (không đổi schema).
// ============================================================

export type AdminUserListItem = {
  id: string
  email: string | null
  name: string | null
  coins: number
  role: string
  plan: string
  created_at: string
  unlock_count: number
}

export async function listUsers(
  admin: SupabaseClient,
  opts: { q?: string; page?: number; perPage?: number },
): Promise<{ items: AdminUserListItem[]; total: number; page: number; per_page: number }> {
  const page = Math.max(1, opts.page ?? 1)
  const perPage = Math.min(100, Math.max(1, opts.perPage ?? 20))
  let query = admin
    .from('profiles')
    .select('id, email, name, coins, role, plan, created_at', { count: 'exact' })
  if (opts.q) {
    const safe = opts.q.replace(/[%_,()]/g, ' ').trim()
    if (safe) query = query.or(`email.ilike.%${safe}%,name.ilike.%${safe}%`)
  }
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1)
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as Omit<AdminUserListItem, 'unlock_count'>[]
  const ids = rows.map((r) => r.id)
  const unlockCount = new Map<string, number>()
  if (ids.length > 0) {
    const { data: un } = await admin.from('product_unlocks').select('user_id').in('user_id', ids)
    for (const row of (un ?? []) as { user_id: string }[]) {
      unlockCount.set(row.user_id, (unlockCount.get(row.user_id) ?? 0) + 1)
    }
  }
  return {
    items: rows.map((r) => ({ ...r, unlock_count: unlockCount.get(r.id) ?? 0 })),
    total: count ?? rows.length,
    page,
    per_page: perPage,
  }
}

export type AdminUserDetail = {
  profile: {
    id: string
    email: string | null
    name: string | null
    coins: number
    role: string
    plan: string
    created_at: string
    banned: boolean
    banned_until: string | null
  }
  unlocks: { product_id: string; via: string; created_at: string; title: string | null; slug: string | null }[]
  transactions: {
    id: string
    type: string
    status: string
    amount_coins: number
    amount_vnd: number | null
    provider: string | null
    note: string | null
    created_at: string
  }[]
  attempts: {
    id: string
    test_id: string
    status: string
    raw_score: number | null
    band: number | null
    time_spent: number | null
    started_at: string
    submitted_at: string | null
    test_title: string | null
    test_type: string | null
  }[]
  writing: {
    attempt_id: string
    graded_at: string | null
    task1_band: number | null
    task2_band: number | null
    overall_band: number | null
    task1_wc: number | null
    task2_wc: number | null
  }[]
  // ADMIN-004 — TỔNG THẬT mỗi danh sách (count exact) để UI KHÔNG nhầm độ dài mảng ĐÃ CAP là tổng.
  //   shown = độ dài mảng (giới hạn DETAIL_LIMITS); total > shown ⇒ UI gắn nhãn "N gần nhất / M tổng".
  counts: { unlocks: number; transactions: number; attempts: number; writing: number }
  limits: { unlocks: number; transactions: number; attempts: number; writing: number }
}

// Cap mỗi danh sách lịch sử ở trang chi tiết admin (preview, không phải export). Total thật lấy riêng (counts).
export const USER_DETAIL_LIMITS = { unlocks: 200, transactions: 100, attempts: 100, writing: 100 } as const

export async function getUserDetail(admin: SupabaseClient, userId: string): Promise<AdminUserDetail | null> {
  const { data: profile, error } = await admin
    .from('profiles')
    .select('id, email, name, coins, role, plan, created_at')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!profile) return null

  // Ban status từ Supabase Auth (banned_until) — không có row auth (hiếm) thì coi như không ban.
  let bannedUntil: string | null = null
  try {
    const { data: au } = await admin.auth.admin.getUserById(userId)
    bannedUntil = ((au?.user as unknown as { banned_until?: string | null })?.banned_until ?? null) || null
  } catch {
    bannedUntil = null
  }
  const banned = bannedUntil != null && new Date(bannedUntil).getTime() > Date.now()

  const L = USER_DETAIL_LIMITS
  // Preview (đã cap) + TỔNG THẬT (count exact, head — chỉ đếm, không kéo row) song song. Đếm trên
  //   cột user_id (đã index) → rẻ; trang chi tiết 1 user nên chi phí đếm chấp nhận được (Owner note).
  const [unlocksRes, txnsRes, attemptsRes, writingRes, unlocksCnt, txnsCnt, attemptsCnt, writingCnt] = await Promise.all([
    admin
      .from('product_unlocks')
      .select('product_id, via, created_at, products(title, slug)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(L.unlocks),
    admin
      .from('transactions')
      .select('id, type, status, amount_coins, amount_vnd, provider, note, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(L.transactions),
    admin
      .from('attempts')
      .select('id, test_id, status, raw_score, band, time_spent, started_at, submitted_at, tests(title, type)')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(L.attempts),
    admin
      .from('writing_submissions')
      .select('attempt_id, graded_at, task1_wc, task2_wc, ai_score')
      .eq('user_id', userId)
      .order('graded_at', { ascending: false })
      .limit(L.writing),
    admin.from('product_unlocks').select('user_id', { count: 'exact', head: true }).eq('user_id', userId),
    admin.from('transactions').select('user_id', { count: 'exact', head: true }).eq('user_id', userId),
    admin.from('attempts').select('user_id', { count: 'exact', head: true }).eq('user_id', userId),
    admin.from('writing_submissions').select('user_id', { count: 'exact', head: true }).eq('user_id', userId),
  ])

  type UnlockRow = { product_id: string; via: string; created_at: string; products: { title: string | null; slug: string | null } | null }
  type AttemptRow = {
    id: string; test_id: string; status: string; raw_score: number | null; band: number | null
    time_spent: number | null; started_at: string; submitted_at: string | null
    tests: { title: string | null; type: string | null } | null
  }
  type WritingRow = { attempt_id: string; graded_at: string | null; task1_wc: number | null; task2_wc: number | null; ai_score: unknown }
  const bandOf = (v: unknown): number | null => {
    if (v && typeof v === 'object' && 'band' in (v as Record<string, unknown>)) {
      const b = (v as { band?: unknown }).band
      return typeof b === 'number' ? b : null
    }
    return null
  }

  return {
    profile: { ...(profile as AdminUserDetail['profile']), banned, banned_until: bannedUntil },
    unlocks: ((unlocksRes.data ?? []) as unknown as UnlockRow[]).map((u) => ({
      product_id: u.product_id,
      via: u.via,
      created_at: u.created_at,
      title: u.products?.title ?? null,
      slug: u.products?.slug ?? null,
    })),
    transactions: (txnsRes.data ?? []) as AdminUserDetail['transactions'],
    attempts: ((attemptsRes.data ?? []) as unknown as AttemptRow[]).map((a) => ({
      id: a.id,
      test_id: a.test_id,
      status: a.status,
      raw_score: a.raw_score,
      band: a.band,
      time_spent: a.time_spent,
      started_at: a.started_at,
      submitted_at: a.submitted_at,
      test_title: a.tests?.title ?? null,
      test_type: a.tests?.type ?? null,
    })),
    writing: ((writingRes.data ?? []) as WritingRow[]).map((w) => {
      const s = (w.ai_score ?? null) as { task1?: unknown; task2?: unknown; overall_band?: unknown } | null
      return {
        attempt_id: w.attempt_id,
        graded_at: w.graded_at,
        task1_band: bandOf(s?.task1),
        task2_band: bandOf(s?.task2),
        overall_band: typeof s?.overall_band === 'number' ? s.overall_band : null,
        task1_wc: w.task1_wc,
        task2_wc: w.task2_wc,
      }
    }),
    counts: {
      unlocks: unlocksCnt.count ?? (unlocksRes.data?.length ?? 0),
      transactions: txnsCnt.count ?? (txnsRes.data?.length ?? 0),
      attempts: attemptsCnt.count ?? (attemptsRes.data?.length ?? 0),
      writing: writingCnt.count ?? (writingRes.data?.length ?? 0),
    },
    limits: { ...L },
  }
}
