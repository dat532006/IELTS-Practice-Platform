// Nav scope v1: Reading/Listening/Writing là chính.
// Speaking & Online Courses NGOÀI scope v1 → comingSoon (disabled), KHÔNG route thật.
export type NavItem = { label: string; href: string; comingSoon?: boolean }

export const MAIN_NAV: NavItem[] = [
  { label: 'Reading', href: '/products?skill=reading' },
  { label: 'Listening', href: '/products?skill=listening' },
  { label: 'Writing', href: '/products?skill=writing' },
  { label: 'Đề Free', href: '/free' },
  { label: 'Prediction', href: '/prediction' },
  { label: 'Bảng giá', href: '/pricing' },
  { label: 'Speaking', href: '#', comingSoon: true },
  { label: 'Online Courses', href: '#', comingSoon: true },
]
