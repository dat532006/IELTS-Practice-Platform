// Bộ legal ĐÚNG 7 trang cho merchant review (plan §17.4 rev 2026-06-01).
// "Giới thiệu"/About KHÔNG nằm trong legal set (là trang public/brand riêng).
export const LEGAL_PAGES = {
  privacy: {
    title: 'Chính sách bảo mật',
    body: 'Chúng tôi cam kết bảo vệ dữ liệu cá nhân của người dùng. Nội dung chi tiết sẽ được hoàn thiện trước khi go-live thanh toán.',
  },
  'payment-policy': {
    title: 'Chính sách thanh toán',
    body: 'Thanh toán bằng coin qua VNPay/MoMo/chuyển khoản. Mọi giao dịch được xác minh ở server.',
  },
  shipping: {
    title: 'Chính sách vận chuyển & giao nhận',
    body: 'Sản phẩm là nội dung số (đề luyện thi), được mở khóa tức thì sau khi thanh toán/redeem thành công.',
  },
  'transaction-terms': {
    title: 'Điều kiện giao dịch chung',
    body: 'Điều kiện sử dụng dịch vụ, quyền và nghĩa vụ của người dùng và nhà cung cấp.',
  },
  refund: {
    title: 'Chính sách hoàn tiền',
    body: 'Quy định hoàn tiền cho sản phẩm số. Nội dung chi tiết hoàn thiện trước go-live.',
  },
  contact: {
    title: 'Liên hệ',
    body: 'Thông tin liên hệ hỗ trợ khách hàng.',
  },
  'business-confirmation': {
    title: 'Xác nhận lĩnh vực kinh doanh',
    body: 'Thông tin xác nhận lĩnh vực kinh doanh phục vụ duyệt merchant cổng thanh toán.',
  },
} as const

export type LegalSlug = keyof typeof LEGAL_PAGES
export const LEGAL_SLUGS = Object.keys(LEGAL_PAGES) as LegalSlug[]
