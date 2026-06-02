// Trạng thái hiển thị của 1 product/đề trên UI (frontend contract W1+2).
// UI phân biệt rõ; KHÔNG tạo link exam direct sai quyền.
export type ProductState = 'free' | 'locked' | 'owned' | 'already_owned' | 'coming_soon'

// Chỉ metadata PUBLIC — không bao giờ chứa passages/questions/audio premium.
export type ProductCardData = {
  slug: string
  title: string
  thumbnail?: string | null
  priceCoins: number
  skills: string[]
  attemptsTotal?: number
  state: ProductState
}
