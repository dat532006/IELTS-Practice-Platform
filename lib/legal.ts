// Bộ legal ĐÚNG 7 trang cho merchant review (plan §17.4 rev 2026-06-01).
// "Giới thiệu"/About KHÔNG nằm trong legal set (là trang public/brand riêng).
//
// W16 (G6): nâng placeholder 1 dòng → CẤU TRÚC nội dung thật (summary + sections) để 7 trang render đủ mục
//   phục vụ duyệt cổng thanh toán. ⚠️ Câu chữ pháp lý CUỐI do Owner/legal cung cấp ở W19 — file này là
//   khung nội dung, KHÔNG tự chế cam kết pháp lý ràng buộc. Điền thông tin doanh nghiệp thật trước go-live.
export const LEGAL_DRAFT_NOTICE =
  'Bản thảo cấu trúc — nội dung pháp lý cuối cùng và thông tin doanh nghiệp sẽ do chủ sở hữu/bộ phận pháp lý xác nhận trước khi phát hành thương mại (W19).'

// {{...}} = chỗ điền thông tin doanh nghiệp thật (tên pháp nhân, MST, địa chỉ, hotline, email) trước go-live.
export type LegalSection = { heading: string; body: string }
export type LegalPageContent = { title: string; summary: string; updated: string; sections: LegalSection[] }

export const LEGAL_PAGES: Record<string, LegalPageContent> = {
  privacy: {
    title: 'Chính sách bảo mật',
    summary: 'Chúng tôi thu thập tối thiểu dữ liệu cần thiết để cung cấp dịch vụ luyện thi và cam kết bảo vệ dữ liệu cá nhân của người dùng.',
    updated: '2026-07-01',
    sections: [
      { heading: 'Dữ liệu thu thập', body: 'Email và thông tin đăng nhập, tiến độ luyện tập (lịch sử làm bài, điểm band), giao dịch nạp coin/mua sản phẩm. Không thu thập dữ liệu nhạy cảm ngoài phạm vi dịch vụ.' },
      { heading: 'Mục đích sử dụng', body: 'Xác thực tài khoản, chấm điểm và lưu lịch sử, xử lý thanh toán, cải thiện chất lượng đề và trải nghiệm học tập.' },
      { heading: 'Chia sẻ với bên thứ ba', body: 'Chỉ chia sẻ với nhà cung cấp hạ tầng (hosting, cơ sở dữ liệu) và cổng thanh toán để hoàn tất giao dịch. Không bán dữ liệu cá nhân.' },
      { heading: 'Bảo mật & quyền của người dùng', body: 'Dữ liệu nhạy cảm (đáp án, mã kích hoạt, khóa dịch vụ) chỉ xử lý phía máy chủ. Người dùng có quyền yêu cầu truy cập, chỉnh sửa hoặc xóa dữ liệu qua kênh liên hệ chính thức.' },
    ],
  },
  'payment-policy': {
    title: 'Chính sách thanh toán',
    summary: 'Thanh toán qua nạp coin (tỷ giá cố định 1.000 VND = 1 coin) rồi dùng coin mở khóa sản phẩm. Mọi giao dịch được xác minh ở máy chủ.',
    updated: '2026-07-01',
    sections: [
      { heading: 'Đơn vị & tỷ giá', body: 'Coin là đơn vị nội bộ để mở khóa sản phẩm. Tỷ giá cố định 1.000 VND = 1 coin. Giá sản phẩm hiển thị theo coin và do máy chủ quyết định (không tin giá phía trình duyệt).' },
      { heading: 'Phương thức', body: 'Nạp coin qua cổng thanh toán được hỗ trợ ({{VNPay/MoMo/chuyển khoản}}). Coin chỉ được cộng sau khi máy chủ nhận và xác minh thành công thông báo thanh toán (webhook), không dựa vào chuyển hướng trình duyệt.' },
      { heading: 'Xác nhận giao dịch', body: 'Sau khi thanh toán thành công, coin/sản phẩm được cập nhật vào tài khoản. Nếu số tiền không khớp, giao dịch được giữ ở trạng thái chờ để đối soát, không tự động cộng phần chênh lệch.' },
      { heading: 'Hỗ trợ', body: 'Mọi thắc mắc về giao dịch vui lòng liên hệ theo trang Liên hệ kèm mã giao dịch để được đối soát.' },
    ],
  },
  shipping: {
    title: 'Chính sách vận chuyển & giao nhận',
    summary: 'Sản phẩm là nội dung số (đề luyện thi), được mở khóa tức thì trong tài khoản sau khi thanh toán/redeem thành công — không có giao nhận vật lý.',
    updated: '2026-07-01',
    sections: [
      { heading: 'Hình thức giao', body: 'Toàn bộ sản phẩm là nội dung số. Sau khi mở khóa thành công, người dùng truy cập ngay trong mục Thư viện/Làm bài của tài khoản.' },
      { heading: 'Thời gian', body: 'Mở khóa tức thì (thường trong vài giây sau khi xác minh thanh toán). Không phát sinh phí hay thời gian vận chuyển.' },
      { heading: 'Sự cố truy cập', body: 'Nếu đã thanh toán nhưng chưa thấy sản phẩm mở khóa, vui lòng làm mới trang và liên hệ hỗ trợ kèm mã giao dịch.' },
    ],
  },
  'transaction-terms': {
    title: 'Điều kiện giao dịch chung',
    summary: 'Điều kiện sử dụng dịch vụ, quyền và nghĩa vụ của người dùng và nhà cung cấp khi giao dịch trên nền tảng.',
    updated: '2026-07-01',
    sections: [
      { heading: 'Phạm vi dịch vụ', body: 'Nền tảng cung cấp đề luyện thi IELTS (Reading/Listening/Writing) với chấm điểm phía máy chủ và phản hồi AI cho Writing. Không bao gồm Speaking và khóa học trực tuyến trong giai đoạn này.' },
      { heading: 'Tài khoản', body: 'Người dùng chịu trách nhiệm bảo mật thông tin đăng nhập và mọi hoạt động trong tài khoản của mình.' },
      { heading: 'Quyền & nghĩa vụ', body: 'Nhà cung cấp đảm bảo dịch vụ vận hành đúng mô tả; người dùng cam kết không sao chép, phân phối lại nội dung đề hoặc gian lận hệ thống.' },
      { heading: 'Thay đổi điều khoản', body: 'Điều khoản có thể được cập nhật; bản mới nhất được công bố tại trang này kèm ngày cập nhật.' },
    ],
  },
  refund: {
    title: 'Chính sách hoàn tiền',
    summary: 'Quy định hoàn tiền cho sản phẩm số. Do nội dung mở khóa tức thì, hoàn tiền áp dụng theo các trường hợp cụ thể bên dưới.',
    updated: '2026-07-01',
    sections: [
      { heading: 'Trường hợp được xem xét hoàn', body: 'Giao dịch bị trừ tiền nhưng không nhận được coin/sản phẩm do lỗi hệ thống; giao dịch trùng lặp do lỗi kỹ thuật.' },
      { heading: 'Trường hợp không hoàn', body: 'Sản phẩm số đã mở khóa và sử dụng, trừ khi lỗi thuộc về nhà cung cấp. Coin đã nạp có thể có điều kiện sử dụng riêng {{nêu rõ trước go-live}}.' },
      { heading: 'Quy trình', body: 'Gửi yêu cầu qua trang Liên hệ kèm mã giao dịch trong vòng {{X}} ngày. Thời gian xử lý/đối soát dự kiến {{Y}} ngày làm việc.' },
    ],
  },
  contact: {
    title: 'Liên hệ',
    summary: 'Thông tin liên hệ hỗ trợ khách hàng và tiếp nhận khiếu nại, đối soát giao dịch.',
    updated: '2026-07-01',
    sections: [
      { heading: 'Hỗ trợ khách hàng', body: 'Email: {{support@domain}} · Hotline: {{số điện thoại}} · Thời gian hỗ trợ: {{giờ làm việc}}.' },
      { heading: 'Đơn vị vận hành', body: 'Tên: {{tên pháp nhân/hộ kinh doanh}} · Địa chỉ: {{địa chỉ đăng ký}} · Mã số thuế: {{MST}}.' },
      { heading: 'Khiếu nại & đối soát', body: 'Với vấn đề giao dịch, vui lòng cung cấp mã giao dịch (provider_txn_id) để được đối soát nhanh.' },
    ],
  },
  'business-confirmation': {
    title: 'Xác nhận lĩnh vực kinh doanh',
    summary: 'Thông tin xác nhận lĩnh vực kinh doanh phục vụ duyệt merchant với cổng thanh toán.',
    updated: '2026-07-01',
    sections: [
      { heading: 'Lĩnh vực kinh doanh', body: 'Cung cấp nội dung giáo dục số: đề luyện thi IELTS và dịch vụ chấm điểm/phản hồi học tập trực tuyến.' },
      { heading: 'Thông tin pháp nhân', body: 'Tên đăng ký: {{tên pháp nhân/hộ kinh doanh}} · Mã số thuế/ĐKKD: {{MST/số ĐKKD}} · Địa chỉ: {{địa chỉ}} · Người đại diện: {{họ tên}}.' },
      { heading: 'Sản phẩm & giá', body: 'Sản phẩm số mở khóa qua coin (1.000 VND = 1 coin); giá niêm yết theo coin, quyết định phía máy chủ. Không kinh doanh hàng hóa vật lý.' },
      { heading: 'Chính sách liên quan', body: 'Xem thêm Chính sách thanh toán, Hoàn tiền, Bảo mật và Điều kiện giao dịch chung được liên kết ở chân trang.' },
    ],
  },
}

export type LegalSlug = keyof typeof LEGAL_PAGES
export const LEGAL_SLUGS = Object.keys(LEGAL_PAGES) as LegalSlug[]
