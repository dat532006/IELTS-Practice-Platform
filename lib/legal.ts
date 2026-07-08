// Bộ legal ĐÚNG 7 trang cho merchant review (plan §17.4 rev 2026-06-01).
// "Giới thiệu"/About KHÔNG nằm trong legal set (là trang public/brand riêng — app/(marketing)/about).
//
// Nội dung do Owner cung cấp qua docs/Content.txt (2026-07-07) — KHÔNG tự chế thêm cam kết pháp lý
//   ngoài file nguồn. Cần sửa câu chữ → sửa Content.txt rồi đồng bộ lại file này.
export type LegalBlock = { p: string } | { list: string[] }
export type LegalSection = { heading: string; blocks: LegalBlock[] }
export type LegalPageContent = { title: string; summary: string; updated?: string; sections: LegalSection[] }

const CONTACT_BLOCKS: LegalBlock[] = [
  { p: 'Tên đơn vị: IELTS PRACTICE PLATFORM' },
  { p: 'Email: ieltspracticeplatform@gmail.com' },
  { p: 'Thời gian hỗ trợ: 09:00 – 22:00 hằng ngày' },
]

export const LEGAL_PAGES: Record<string, LegalPageContent> = {
  privacy: {
    title: 'Chính sách bảo mật',
    summary:
      'Chúng tôi cam kết bảo vệ dữ liệu cá nhân của người dùng và chỉ thu thập những thông tin cần thiết để cung cấp, vận hành và cải thiện dịch vụ luyện thi.',
    sections: [
      {
        heading: '1. Dữ liệu thu thập',
        blocks: [
          { p: 'Chúng tôi có thể thu thập các thông tin sau:' },
          {
            list: [
              'Thông tin tài khoản: email, thông tin đăng nhập và dữ liệu xác thực.',
              'Dữ liệu học tập: lịch sử làm bài, đáp án, điểm số, band điểm, tiến độ luyện tập.',
              'Dữ liệu giao dịch: lịch sử nạp coin, mua sản phẩm/dịch vụ, trạng thái thanh toán.',
              'Dữ liệu kỹ thuật: địa chỉ IP, thiết bị, trình duyệt, nhật ký truy cập và lỗi hệ thống.',
            ],
          },
          { p: 'Chúng tôi không chủ động thu thập dữ liệu nhạy cảm ngoài phạm vi cần thiết cho việc cung cấp dịch vụ.' },
        ],
      },
      {
        heading: '2. Mục đích sử dụng',
        blocks: [
          { p: 'Dữ liệu được sử dụng để:' },
          {
            list: [
              'Xác thực và quản lý tài khoản người dùng.',
              'Chấm điểm, lưu lịch sử học tập và cá nhân hóa trải nghiệm luyện thi.',
              'Xử lý thanh toán, nạp coin và kích hoạt sản phẩm/dịch vụ.',
              'Cải thiện chất lượng đề, hệ thống chấm điểm và trải nghiệm người dùng.',
              'Bảo mật hệ thống, phòng chống gian lận và xử lý vi phạm.',
              'Thực hiện nghĩa vụ pháp lý khi cần thiết.',
            ],
          },
        ],
      },
      {
        heading: '3. Chia sẻ dữ liệu',
        blocks: [
          { p: 'Chúng tôi không bán dữ liệu cá nhân của người dùng.' },
          {
            p: 'Dữ liệu chỉ được chia sẻ trong phạm vi cần thiết với các bên cung cấp dịch vụ như hạ tầng máy chủ, cơ sở dữ liệu, cổng thanh toán, công cụ hỗ trợ kỹ thuật hoặc cơ quan có thẩm quyền theo quy định pháp luật.',
          },
          {
            p: 'Các bên liên quan phải áp dụng biện pháp bảo mật phù hợp và chỉ sử dụng dữ liệu cho mục đích đã được cho phép.',
          },
        ],
      },
      {
        heading: '4. Bảo mật dữ liệu',
        blocks: [
          {
            p: 'Chúng tôi áp dụng các biện pháp kỹ thuật và tổ chức phù hợp để bảo vệ dữ liệu khỏi truy cập trái phép, mất mát, thay đổi hoặc tiết lộ ngoài ý muốn.',
          },
          {
            p: 'Các dữ liệu quan trọng như đáp án, mã kích hoạt, khóa dịch vụ và thông tin xác thực được xử lý chủ yếu phía máy chủ nhằm hạn chế rủi ro bảo mật.',
          },
          {
            p: 'Người dùng có trách nhiệm bảo mật thông tin đăng nhập và thông báo cho chúng tôi nếu phát hiện dấu hiệu truy cập trái phép.',
          },
        ],
      },
      {
        heading: '5. Lưu trữ dữ liệu',
        blocks: [
          {
            p: 'Dữ liệu được lưu trữ trong thời gian cần thiết để cung cấp dịch vụ, xử lý giao dịch, hỗ trợ người dùng, phòng chống gian lận và đáp ứng nghĩa vụ pháp lý.',
          },
          {
            p: 'Khi không còn cần thiết hoặc khi có yêu cầu hợp lệ từ người dùng, chúng tôi sẽ xóa, ẩn danh hóa hoặc hạn chế xử lý dữ liệu theo quy định pháp luật.',
          },
        ],
      },
      {
        heading: '6. Quyền của người dùng',
        blocks: [
          {
            p: 'Người dùng có quyền yêu cầu truy cập, chỉnh sửa, cập nhật hoặc xóa dữ liệu cá nhân của mình trong phạm vi pháp luật cho phép.',
          },
          {
            p: 'Để thực hiện các quyền này, người dùng vui lòng liên hệ qua kênh hỗ trợ chính thức. Chúng tôi có thể yêu cầu xác minh danh tính trước khi xử lý yêu cầu nhằm bảo vệ tài khoản và dữ liệu cá nhân.',
          },
        ],
      },
      {
        heading: '7. Cookie và dữ liệu kỹ thuật',
        blocks: [
          {
            p: 'Chúng tôi có thể sử dụng cookie hoặc công nghệ tương tự để duy trì phiên đăng nhập, ghi nhớ tùy chọn, phân tích hiệu năng và cải thiện trải nghiệm sử dụng.',
          },
          {
            p: 'Người dùng có thể điều chỉnh cài đặt cookie trên trình duyệt, tuy nhiên một số tính năng có thể không hoạt động đầy đủ nếu cookie cần thiết bị tắt.',
          },
        ],
      },
      {
        heading: '8. Cập nhật chính sách',
        blocks: [
          {
            p: 'Chính sách bảo mật này có thể được cập nhật để phù hợp với thay đổi của dịch vụ, công nghệ hoặc quy định pháp luật. Phiên bản mới nhất sẽ được công bố trên website hoặc ứng dụng.',
          },
        ],
      },
      {
        heading: '9. Thông tin liên hệ',
        blocks: [{ p: 'Mọi câu hỏi hoặc yêu cầu liên quan đến dữ liệu cá nhân vui lòng liên hệ:' }, ...CONTACT_BLOCKS],
      },
    ],
  },
  'payment-policy': {
    title: 'Chính sách thanh toán',
    updated: '2026-07-01',
    summary:
      'Chính sách này quy định cách người dùng nạp coin, sử dụng coin để mở khóa sản phẩm/dịch vụ và cách chúng tôi xác minh, xử lý giao dịch trên hệ thống.',
    sections: [
      {
        heading: '1. Đơn vị thanh toán nội bộ',
        blocks: [
          { p: 'Coin là đơn vị nội bộ được sử dụng để mở khóa sản phẩm hoặc dịch vụ trên nền tảng.' },
          { p: 'Tỷ giá quy đổi cố định: 1.000 VND = 1 coin.' },
          {
            p: 'Giá sản phẩm/dịch vụ được hiển thị bằng coin và được xác định bởi hệ thống máy chủ. Chúng tôi không dựa vào dữ liệu giá, số coin hoặc trạng thái thanh toán được gửi từ trình duyệt người dùng để xác nhận giao dịch.',
          },
        ],
      },
      {
        heading: '2. Phương thức nạp coin',
        blocks: [
          {
            p: 'Người dùng có thể nạp coin thông qua các phương thức thanh toán được hỗ trợ, bao gồm: VNPay/MoMo.',
          },
          {
            p: 'Coin chỉ được cộng vào tài khoản sau khi hệ thống máy chủ nhận được và xác minh thành công thông báo thanh toán từ cổng thanh toán, ngân hàng hoặc hệ thống đối soát hợp lệ.',
          },
          {
            p: 'Việc người dùng được chuyển hướng về website hoặc ứng dụng sau khi thanh toán không được xem là căn cứ duy nhất để xác nhận giao dịch thành công.',
          },
        ],
      },
      {
        heading: '3. Xác nhận và cập nhật giao dịch',
        blocks: [
          {
            p: 'Sau khi giao dịch được xác minh thành công, số coin tương ứng sẽ được cộng vào tài khoản người dùng hoặc sản phẩm/dịch vụ sẽ được mở khóa theo giao dịch đã thực hiện.',
          },
          {
            p: 'Nếu số tiền thanh toán, mã giao dịch, nội dung chuyển khoản hoặc thông tin đơn hàng không khớp với dữ liệu trên hệ thống, giao dịch có thể được giữ ở trạng thái chờ để đối soát. Trong trường hợp này, hệ thống sẽ không tự động cộng coin hoặc cộng phần chênh lệch cho đến khi việc đối soát hoàn tất.',
          },
        ],
      },
      {
        heading: '4. Sử dụng coin',
        blocks: [
          { p: 'Coin chỉ có giá trị sử dụng trong phạm vi nền tảng để mở khóa sản phẩm/dịch vụ được hỗ trợ.' },
          {
            p: 'Người dùng có trách nhiệm kiểm tra kỹ thông tin sản phẩm, số coin cần sử dụng và tài khoản thực hiện giao dịch trước khi xác nhận mở khóa.',
          },
          {
            p: 'Sau khi sản phẩm/dịch vụ đã được mở khóa thành công, giao dịch sẽ được ghi nhận vào lịch sử tài khoản.',
          },
        ],
      },
      {
        heading: '5. Lỗi giao dịch và đối soát',
        blocks: [
          {
            p: 'Trong trường hợp phát sinh lỗi thanh toán, giao dịch chưa được cộng coin, cộng sai số coin hoặc không mở khóa được sản phẩm/dịch vụ sau khi đã thanh toán, người dùng vui lòng liên hệ kênh hỗ trợ chính thức để được kiểm tra.',
          },
          {
            p: 'Khi gửi yêu cầu hỗ trợ, người dùng cần cung cấp thông tin liên quan như mã giao dịch, thời gian thanh toán, số tiền đã thanh toán, phương thức thanh toán và tài khoản sử dụng dịch vụ.',
          },
          {
            p: 'Chúng tôi sẽ kiểm tra dữ liệu trên hệ thống máy chủ, thông tin từ cổng thanh toán hoặc sao kê đối soát để xử lý yêu cầu.',
          },
        ],
      },
      {
        heading: '6. Bảo mật giao dịch',
        blocks: [
          {
            p: 'Mọi giao dịch thanh toán, nạp coin và mở khóa sản phẩm/dịch vụ được xác minh và xử lý tại máy chủ nhằm hạn chế gian lận, sai lệch dữ liệu hoặc can thiệp từ phía trình duyệt.',
          },
          {
            p: 'Người dùng không được can thiệp, chỉnh sửa, giả mạo dữ liệu thanh toán, số coin, giá sản phẩm hoặc trạng thái giao dịch. Các hành vi vi phạm có thể dẫn đến việc tạm khóa tài khoản, hủy giao dịch hoặc áp dụng biện pháp xử lý phù hợp theo điều khoản sử dụng.',
          },
        ],
      },
      {
        heading: '7. Thông tin liên hệ',
        blocks: [{ p: 'Mọi thắc mắc hoặc yêu cầu hỗ trợ liên quan đến giao dịch vui lòng liên hệ:' }, ...CONTACT_BLOCKS],
      },
    ],
  },
  shipping: {
    title: 'Chính sách vận chuyển & giao nhận',
    updated: '2026-07-01',
    summary: 'Chính sách này áp dụng cho việc cung cấp sản phẩm/dịch vụ là nội dung số trên nền tảng.',
    sections: [
      {
        heading: '1. Hình thức giao nhận',
        blocks: [
          {
            p: 'Toàn bộ sản phẩm/dịch vụ trên nền tảng là nội dung số, bao gồm đề luyện thi, tài liệu học tập hoặc các tính năng học tập được mở khóa trong tài khoản người dùng.',
          },
          { p: 'Chúng tôi không thực hiện giao nhận hàng hóa vật lý và không phát sinh phí vận chuyển.' },
        ],
      },
      {
        heading: '2. Thời gian giao nhận',
        blocks: [
          {
            p: 'Sau khi giao dịch thanh toán, nạp coin hoặc redeem mã kích hoạt được hệ thống xác minh thành công, sản phẩm/dịch vụ sẽ được mở khóa trực tiếp trong tài khoản người dùng.',
          },
          {
            p: 'Thông thường, việc mở khóa được thực hiện gần như tức thì hoặc trong vòng vài giây sau khi xác minh thành công.',
          },
          {
            p: 'Người dùng có thể truy cập sản phẩm/dịch vụ đã mở khóa tại mục Thư viện, Làm bài hoặc khu vực tương ứng trong tài khoản.',
          },
        ],
      },
      {
        heading: '3. Sự cố truy cập',
        blocks: [
          {
            p: 'Nếu người dùng đã thanh toán hoặc redeem thành công nhưng chưa thấy sản phẩm/dịch vụ được mở khóa, vui lòng thử làm mới trang, đăng xuất và đăng nhập lại, sau đó kiểm tra lại tài khoản.',
          },
          {
            p: 'Nếu sự cố vẫn tiếp diễn, người dùng vui lòng liên hệ kênh hỗ trợ chính thức và cung cấp mã giao dịch, thời gian thanh toán/redeem, tài khoản sử dụng dịch vụ và thông tin liên quan để được kiểm tra, đối soát và hỗ trợ xử lý.',
          },
        ],
      },
      {
        heading: '4. Thông tin liên hệ',
        blocks: [
          { p: 'Mọi thắc mắc hoặc yêu cầu hỗ trợ liên quan đến việc mở khóa sản phẩm/dịch vụ vui lòng liên hệ:' },
          ...CONTACT_BLOCKS,
        ],
      },
    ],
  },
  'transaction-terms': {
    title: 'Điều kiện giao dịch chung',
    updated: '2026-07-01',
    summary:
      'Điều kiện giao dịch chung này quy định việc sử dụng dịch vụ, quyền và nghĩa vụ của người dùng và nhà cung cấp khi thực hiện giao dịch trên nền tảng.',
    sections: [
      {
        heading: '1. Phạm vi dịch vụ',
        blocks: [
          {
            p: 'Nền tảng cung cấp sản phẩm/dịch vụ nội dung số phục vụ luyện thi IELTS, bao gồm đề luyện tập Reading, Listening, Writing, tính năng chấm điểm phía máy chủ và phản hồi AI cho bài Writing.',
          },
          {
            p: 'Trong giai đoạn hiện tại, dịch vụ chưa bao gồm phần Speaking và chưa cung cấp khóa học trực tuyến có giáo viên hướng dẫn, trừ khi được thông báo riêng trên nền tảng.',
          },
        ],
      },
      {
        heading: '2. Tài khoản người dùng',
        blocks: [
          {
            p: 'Người dùng cần đăng ký hoặc đăng nhập tài khoản để sử dụng một số tính năng, nạp coin, mở khóa sản phẩm/dịch vụ và lưu lịch sử học tập.',
          },
          {
            p: 'Người dùng chịu trách nhiệm bảo mật thông tin đăng nhập và mọi hoạt động phát sinh trong tài khoản của mình. Nếu phát hiện dấu hiệu truy cập trái phép, người dùng cần thông báo ngay cho chúng tôi qua kênh hỗ trợ chính thức.',
          },
        ],
      },
      {
        heading: '3. Giao dịch và sử dụng dịch vụ',
        blocks: [
          {
            p: 'Người dùng có thể nạp coin hoặc sử dụng phương thức thanh toán được hỗ trợ để mở khóa sản phẩm/dịch vụ trên nền tảng.',
          },
          {
            p: 'Thông tin về giá, số coin cần sử dụng, trạng thái giao dịch và quyền truy cập sản phẩm/dịch vụ được xác định và xác minh bởi hệ thống máy chủ.',
          },
          {
            p: 'Sau khi giao dịch được xác minh thành công, sản phẩm/dịch vụ sẽ được mở khóa trong tài khoản người dùng theo chính sách thanh toán và chính sách giao nhận nội dung số được công bố trên nền tảng.',
          },
        ],
      },
      {
        heading: '4. Quyền và nghĩa vụ của nhà cung cấp',
        blocks: [
          {
            p: 'Chúng tôi có trách nhiệm cung cấp dịch vụ đúng với mô tả đã công bố, duy trì hệ thống trong khả năng hợp lý và hỗ trợ người dùng khi phát sinh lỗi kỹ thuật hoặc vấn đề liên quan đến giao dịch.',
          },
          {
            p: 'Chúng tôi có quyền tạm ngừng, giới hạn hoặc từ chối cung cấp dịch vụ trong trường hợp người dùng vi phạm điều khoản, có hành vi gian lận, can thiệp hệ thống, lạm dụng dịch vụ hoặc sử dụng nền tảng trái pháp luật.',
          },
        ],
      },
      {
        heading: '5. Quyền và nghĩa vụ của người dùng',
        blocks: [
          {
            p: 'Người dùng có quyền truy cập và sử dụng sản phẩm/dịch vụ đã mở khóa hợp lệ trong tài khoản của mình theo phạm vi được nền tảng cho phép.',
          },
          {
            p: 'Người dùng cam kết không sao chép, chia sẻ, bán lại, phân phối, khai thác thương mại trái phép nội dung đề thi, đáp án, lời giải, phản hồi AI hoặc bất kỳ nội dung nào thuộc nền tảng.',
          },
          {
            p: 'Người dùng không được gian lận, can thiệp kỹ thuật, giả mạo giao dịch, khai thác lỗi hệ thống hoặc thực hiện hành vi gây ảnh hưởng đến tính ổn định, bảo mật và công bằng của nền tảng.',
          },
        ],
      },
      {
        heading: '6. Sở hữu trí tuệ',
        blocks: [
          {
            p: 'Toàn bộ nội dung, dữ liệu, giao diện, tính năng, đề luyện thi, lời giải, hệ thống chấm điểm và tài nguyên trên nền tảng thuộc quyền sở hữu hoặc quyền sử dụng hợp pháp của chúng tôi hoặc đối tác liên quan.',
          },
          {
            p: 'Việc người dùng sử dụng dịch vụ không đồng nghĩa với việc được chuyển giao quyền sở hữu trí tuệ đối với bất kỳ nội dung hoặc công nghệ nào trên nền tảng.',
          },
        ],
      },
      {
        heading: '7. Thay đổi, tạm ngừng dịch vụ',
        blocks: [
          {
            p: 'Chúng tôi có thể cập nhật, thay đổi, tạm ngừng hoặc ngừng cung cấp một phần dịch vụ để bảo trì, nâng cấp, sửa lỗi, đáp ứng yêu cầu pháp lý hoặc điều chỉnh hoạt động kinh doanh.',
          },
          {
            p: 'Trong trường hợp thay đổi quan trọng ảnh hưởng đến quyền lợi người dùng, chúng tôi sẽ thông báo bằng phương thức phù hợp trên website, ứng dụng hoặc kênh liên hệ chính thức.',
          },
        ],
      },
      {
        heading: '8. Cập nhật điều kiện giao dịch',
        blocks: [
          {
            p: 'Điều kiện giao dịch chung này có thể được cập nhật theo từng thời điểm để phù hợp với thay đổi của dịch vụ, công nghệ hoặc quy định pháp luật.',
          },
          {
            p: 'Phiên bản mới nhất sẽ được công bố trên website hoặc ứng dụng kèm ngày cập nhật. Việc tiếp tục sử dụng dịch vụ sau khi điều kiện được cập nhật được hiểu là người dùng đã đọc và đồng ý với nội dung mới, trong phạm vi pháp luật cho phép.',
          },
        ],
      },
      {
        heading: '9. Thông tin liên hệ',
        blocks: [
          { p: 'Mọi thắc mắc hoặc yêu cầu hỗ trợ liên quan đến điều kiện giao dịch chung vui lòng liên hệ:' },
          ...CONTACT_BLOCKS,
        ],
      },
    ],
  },
  refund: {
    title: 'Chính sách hoàn tiền',
    updated: '2026-07-01',
    summary:
      'Chính sách này quy định việc xem xét hoàn tiền đối với sản phẩm/dịch vụ nội dung số được cung cấp trên nền tảng IELTS PRACTICE PLATFORM. Do sản phẩm là nội dung số và có thể được mở khóa, truy cập hoặc sử dụng ngay sau khi giao dịch thành công, việc hoàn tiền chỉ áp dụng trong các trường hợp cụ thể được nêu dưới đây.',
    sections: [
      {
        heading: '1. Trường hợp được xem xét hoàn tiền',
        blocks: [
          { p: 'Người dùng có thể được xem xét hoàn tiền hoặc xử lý bù trừ trong các trường hợp sau:' },
          {
            list: [
              'Giao dịch đã bị trừ tiền nhưng tài khoản không nhận được coin hoặc sản phẩm/dịch vụ do lỗi hệ thống.',
              'Giao dịch bị ghi nhận trùng lặp do lỗi kỹ thuật.',
              'Người dùng đã thanh toán thành công nhưng sản phẩm/dịch vụ không thể mở khóa do lỗi thuộc về hệ thống của chúng tôi.',
              'Các trường hợp khác được IELTS PRACTICE PLATFORM xác nhận là lỗi phát sinh từ phía nhà cung cấp.',
            ],
          },
        ],
      },
      {
        heading: '2. Trường hợp không hoàn tiền',
        blocks: [
          { p: 'Chúng tôi không áp dụng hoàn tiền trong các trường hợp sau:' },
          {
            list: [
              'Sản phẩm/dịch vụ nội dung số đã được mở khóa và người dùng đã truy cập hoặc sử dụng, trừ khi lỗi thuộc về nhà cung cấp.',
              'Người dùng mua nhầm sản phẩm, chọn nhầm tài khoản hoặc thay đổi nhu cầu sau khi sản phẩm/dịch vụ đã được mở khóa.',
              'Người dùng vi phạm điều kiện sử dụng, gian lận giao dịch, can thiệp hệ thống hoặc sử dụng dịch vụ sai mục đích.',
              'Coin đã nạp và đã sử dụng để mở khóa sản phẩm/dịch vụ.',
            ],
          },
          {
            p: 'Coin là đơn vị nội bộ dùng để mở khóa sản phẩm/dịch vụ trên nền tảng và không có giá trị quy đổi thành tiền mặt, trừ trường hợp hoàn tiền được chúng tôi xác nhận theo chính sách này.',
          },
        ],
      },
      {
        heading: '3. Quy trình yêu cầu hoàn tiền',
        blocks: [
          {
            p: 'Để yêu cầu hoàn tiền hoặc đối soát giao dịch, người dùng vui lòng liên hệ qua email ieltspracticeplatform@gmail.com trong vòng 07 ngày kể từ ngày phát sinh giao dịch.',
          },
          { p: 'Yêu cầu cần cung cấp đầy đủ các thông tin sau:' },
          {
            list: [
              'Email tài khoản sử dụng dịch vụ.',
              'Mã giao dịch hoặc mã đơn hàng.',
              'Thời gian thanh toán.',
              'Số tiền đã thanh toán.',
              'Phương thức thanh toán.',
              'Mô tả sự cố và hình ảnh/chứng từ liên quan, nếu có.',
            ],
          },
        ],
      },
      {
        heading: '4. Thời gian xử lý',
        blocks: [
          {
            p: 'Sau khi nhận được đầy đủ thông tin hợp lệ, chúng tôi sẽ kiểm tra dữ liệu hệ thống, lịch sử giao dịch và thông tin đối soát từ cổng thanh toán hoặc ngân hàng.',
          },
          {
            p: 'Thời gian xử lý dự kiến là 05–10 ngày làm việc, tùy thuộc vào mức độ phức tạp của giao dịch và thời gian phản hồi từ bên thanh toán liên quan.',
          },
          {
            p: 'Nếu yêu cầu được chấp thuận, khoản hoàn tiền sẽ được thực hiện qua phương thức thanh toán ban đầu hoặc phương thức phù hợp khác do chúng tôi thông báo.',
          },
        ],
      },
      {
        heading: '5. Thông tin liên hệ',
        blocks: [{ p: 'Mọi thắc mắc hoặc yêu cầu hỗ trợ liên quan đến hoàn tiền vui lòng liên hệ:' }, ...CONTACT_BLOCKS],
      },
    ],
  },
  contact: {
    title: 'Liên hệ',
    updated: '2026-07-01',
    summary:
      'Trang này cung cấp thông tin liên hệ hỗ trợ khách hàng, tiếp nhận khiếu nại và xử lý đối soát giao dịch trên nền tảng IELTS PRACTICE PLATFORM.',
    sections: [
      {
        heading: '1. Hỗ trợ khách hàng',
        blocks: [
          {
            p: 'Người dùng có thể liên hệ với chúng tôi để được hỗ trợ về tài khoản, thanh toán, nạp coin, mở khóa sản phẩm/dịch vụ, lỗi kỹ thuật hoặc các vấn đề phát sinh trong quá trình sử dụng nền tảng.',
          },
          { p: 'Email hỗ trợ: ieltspracticeplatform@gmail.com' },
          { p: 'Thời gian hỗ trợ: 09:00 – 22:00 hằng ngày' },
        ],
      },
      {
        heading: '2. Đơn vị vận hành',
        blocks: [
          { p: 'Tên đơn vị: IELTS PRACTICE PLATFORM' },
          { p: 'Địa chỉ: Dĩ An, Hồ Chí Minh' },
          {
            p: 'Thông tin pháp nhân, địa chỉ và mã số thuế sẽ được cập nhật theo hồ sơ đăng ký chính thức của đơn vị vận hành trước khi phát hành thương mại.',
          },
        ],
      },
      {
        heading: '3. Khiếu nại và đối soát giao dịch',
        blocks: [
          {
            p: 'Đối với các vấn đề liên quan đến thanh toán, nạp coin, hoàn tiền hoặc mở khóa sản phẩm/dịch vụ, người dùng vui lòng liên hệ qua email hỗ trợ và cung cấp đầy đủ thông tin sau:',
          },
          {
            list: [
              'Email tài khoản sử dụng dịch vụ.',
              'Mã giao dịch hoặc mã đơn hàng.',
              'Thời gian thanh toán.',
              'Số tiền đã thanh toán.',
              'Phương thức thanh toán.',
              'Mô tả sự cố và hình ảnh/chứng từ liên quan, nếu có.',
            ],
          },
          {
            p: 'Việc cung cấp đầy đủ thông tin, đặc biệt là mã giao dịch, sẽ giúp quá trình kiểm tra và đối soát được thực hiện nhanh chóng, chính xác hơn.',
          },
        ],
      },
    ],
  },
  'business-confirmation': {
    title: 'Xác nhận lĩnh vực kinh doanh',
    updated: '2026-07-01',
    summary:
      'Tài liệu này cung cấp thông tin xác nhận lĩnh vực kinh doanh của IELTS PRACTICE PLATFORM nhằm phục vụ quá trình đăng ký, xét duyệt hoặc đối soát với cổng thanh toán và các bên liên quan.',
    sections: [
      {
        heading: '1. Lĩnh vực kinh doanh',
        blocks: [
          {
            p: 'IELTS PRACTICE PLATFORM hoạt động trong lĩnh vực giáo dục số, cung cấp nội dung và công cụ luyện thi IELTS trực tuyến.',
          },
          {
            p: 'Dịch vụ chính bao gồm đề luyện thi IELTS, tính năng làm bài trực tuyến, chấm điểm phía máy chủ và phản hồi học tập bằng AI cho một số kỹ năng được hỗ trợ.',
          },
        ],
      },
      {
        heading: '2. Sản phẩm và dịch vụ',
        blocks: [
          {
            p: 'Sản phẩm/dịch vụ trên nền tảng là nội dung số, bao gồm đề luyện tập, tài liệu học tập, lượt sử dụng tính năng chấm điểm hoặc các nội dung học tập được mở khóa trong tài khoản người dùng.',
          },
          {
            p: 'Nền tảng không kinh doanh hàng hóa vật lý và không phát sinh hoạt động vận chuyển/giao nhận hàng hóa hữu hình.',
          },
        ],
      },
      {
        heading: '3. Cơ chế thanh toán và mở khóa',
        blocks: [
          { p: 'Người dùng có thể nạp coin để mở khóa sản phẩm/dịch vụ trên nền tảng.' },
          { p: 'Tỷ giá quy đổi: 1.000 VND = 1 coin.' },
          {
            p: 'Giá sản phẩm/dịch vụ được niêm yết theo coin và được xác định bởi hệ thống máy chủ. Mọi giao dịch thanh toán, cộng coin và mở khóa sản phẩm/dịch vụ đều được xác minh phía máy chủ nhằm đảm bảo tính chính xác và phòng chống gian lận.',
          },
        ],
      },
      {
        heading: '4. Thông tin đơn vị vận hành',
        blocks: [
          { p: 'Tên đơn vị: IELTS PRACTICE PLATFORM' },
          { p: 'Người đại diện: Nguyễn Đức Đạt' },
          { p: 'Email hỗ trợ: ieltspracticeplatform@gmail.com' },
          { p: 'Thời gian hỗ trợ: 09:00 – 22:00 hằng ngày' },
        ],
      },
      {
        heading: '5. Chính sách liên quan',
        blocks: [
          {
            p: 'Các chính sách liên quan đến hoạt động cung cấp dịch vụ và giao dịch trên nền tảng bao gồm:',
          },
          {
            list: [
              'Chính sách thanh toán',
              'Chính sách hoàn tiền',
              'Chính sách vận chuyển & giao nhận',
              'Chính sách bảo mật',
              'Điều kiện giao dịch chung',
            ],
          },
          {
            p: 'Các chính sách này được công bố trên website hoặc ứng dụng của IELTS PRACTICE PLATFORM và có thể được liên kết tại chân trang hoặc khu vực thông tin chính sách.',
          },
        ],
      },
    ],
  },
}

export type LegalSlug = keyof typeof LEGAL_PAGES
export const LEGAL_SLUGS = Object.keys(LEGAL_PAGES) as LegalSlug[]
