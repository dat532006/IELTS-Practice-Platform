// Nav scope v1: Reading/Listening/Writing là chính.
// Speaking NGOÀI scope v1 → comingSoon (disabled), KHÔNG route thật.
// Label tiếng Anh — đồng bộ với header trang chủ (app/page.tsx).
export type NavItem = { label: string; href: string; comingSoon?: boolean }

export const MAIN_NAV: NavItem[] = [
  { label: 'Reading', href: '/products?skill=reading' },
  { label: 'Listening', href: '/products?skill=listening' },
  { label: 'Writing', href: '/products?skill=writing' },
  { label: 'Free tests', href: '/free' },
  { label: 'Prediction', href: '/prediction' },
  { label: 'Tips', href: '/tips' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Speaking', href: '#', comingSoon: true },
]
