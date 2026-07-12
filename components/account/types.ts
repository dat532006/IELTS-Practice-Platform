import type { SkillKey } from '@/components/brand/skill'

// Contract dữ liệu trang Tài khoản (server → client). Chỉ metadata own-only (RLS lọc phía server).
export type TxnType = 'topup' | 'spend' | 'refund' | 'bonus' | 'adjust'
export type TxnStatus = 'pending' | 'success' | 'failed' | 'expired'

export type AccountProfile = {
  id: string
  email: string | null
  name: string | null
  avatar: string | null
  coins: number
  plan: string
  createdAt: string | null
  emailVerified: boolean
  ownedPacks: number
  ownedTests: number
}

export type AccountTxn = {
  id: string
  type: TxnType
  amountCoins: number
  provider: string | null
  status: TxnStatus
  createdAt: string
}

export type LibraryPack = {
  slug: string
  title: string
  skill: SkillKey
  totalTests: number
  completedTests: number
}

export type AccountData = {
  profile: AccountProfile
  transactions: AccountTxn[]
  library: LibraryPack[]
}
