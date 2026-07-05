import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { AccountClient } from '@/components/account/AccountClient'
import type { AccountData, LibraryPack } from '@/components/account/types'
import type { SkillKey } from '@/components/brand/skill'

export const metadata: Metadata = { title: 'Tài khoản', robots: { index: false } }

const REAL_SKILLS = ['reading', 'listening', 'writing'] as const
function deriveSkill(skills: string[] | null): SkillKey {
  if (!skills || skills.length === 0) return 'mixed'
  if (skills.length === 1 && (REAL_SKILLS as readonly string[]).includes(skills[0])) return skills[0] as SkillKey
  return 'mixed'
}

// Trang Tài khoản — server component. Dùng server client (session user) → RLS own-only:
//   profiles / product_unlocks / transactions / test_unlocks / attempts đều lọc theo user.
//   KHÔNG service_role → không thể lộ dữ liệu người khác. Chỉ đọc; mọi mutate chạy ở client (RLS chặn cột nhạy cảm).
export default async function AccountPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/account')

  const [profileRes, unlocksRes, txnRes, testUnlocksRes, submittedRes] = await Promise.all([
    supabase.from('profiles').select('id, email, name, avatar, coins, plan, created_at').eq('id', user.id).maybeSingle(),
    supabase.from('product_unlocks').select('product_id').eq('user_id', user.id),
    supabase
      .from('transactions')
      .select('id, type, amount_coins, provider, status, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase.from('test_unlocks').select('test_id, product_id').eq('user_id', user.id),
    supabase.from('attempts').select('test_id').eq('user_id', user.id).eq('status', 'submitted'),
  ])

  const p = (profileRes.data ?? {}) as {
    email?: string | null
    name?: string | null
    avatar?: string | null
    coins?: number
    plan?: string
    created_at?: string | null
  }
  const ownedIds = (unlocksRes.data ?? []).map((r) => (r as { product_id: string }).product_id).filter(Boolean)
  const testUnlocks = (testUnlocksRes.data ?? []) as { test_id: string; product_id: string }[]

  // Thư viện: metadata public từ product_search (skills + test_count), tiến độ từ test_unlocks ∩ attempts submitted.
  let library: LibraryPack[] = []
  if (ownedIds.length) {
    const { data: searchRows } = await supabase
      .from('product_search')
      .select('product_id, slug, title, skills, test_count')
      .in('product_id', ownedIds)

    const submitted = new Set((submittedRes.data ?? []).map((r) => (r as { test_id: string }).test_id))
    const testsByProduct = new Map<string, string[]>()
    for (const row of testUnlocks) {
      const arr = testsByProduct.get(row.product_id) ?? []
      arr.push(row.test_id)
      testsByProduct.set(row.product_id, arr)
    }
    library = (searchRows ?? []).map((r) => {
      const row = r as { product_id: string; slug: string; title: string; skills: string[] | null; test_count: number | null }
      const packTests = testsByProduct.get(row.product_id) ?? []
      return {
        slug: row.slug,
        title: row.title,
        skill: deriveSkill(row.skills),
        totalTests: row.test_count ?? packTests.length,
        completedTests: packTests.filter((t) => submitted.has(t)).length,
      }
    })
  }

  const data: AccountData = {
    profile: {
      id: user.id,
      email: p.email ?? user.email ?? null,
      name: p.name ?? null,
      avatar: p.avatar ?? null,
      coins: p.coins ?? 0,
      plan: p.plan ?? 'free',
      createdAt: p.created_at ?? user.created_at ?? null,
      emailVerified: Boolean(user.email_confirmed_at),
      ownedPacks: ownedIds.length,
      ownedTests: testUnlocks.length,
    },
    transactions: (txnRes.data ?? []).map((t) => {
      const row = t as {
        id: string
        type: AccountData['transactions'][number]['type']
        amount_coins: number | null
        provider: string | null
        status: AccountData['transactions'][number]['status']
        created_at: string
      }
      return {
        id: row.id,
        type: row.type,
        amountCoins: row.amount_coins ?? 0,
        provider: row.provider,
        status: row.status,
        createdAt: row.created_at,
      }
    }),
    library,
  }

  return <AccountClient data={data} />
}
