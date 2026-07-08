import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Giới thiệu',
  description:
    'IELTS Practice Platform — nền tảng luyện thi IELTS trực tuyến với giao diện mô phỏng thi thật và AI hỗ trợ chấm Writing.',
}

// Nội dung do Owner cung cấp qua docs/Content.txt (2026-07-07) — trang public/brand, không thuộc bộ legal 7 trang.
export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900">Giới thiệu</h1>
      <div className="mt-6 space-y-4 leading-relaxed text-slate-600">
        <p>
          <strong className="text-slate-800">IELTS Practice Platform</strong> là nền tảng luyện thi IELTS trực tuyến,
          được xây dựng dành cho người học muốn luyện đề sát kỳ thi thật, làm quen giao diện thi và cải thiện band điểm
          một cách có định hướng.
        </p>
        <p>
          Nền tảng phù hợp nhất với những người đang trong giai đoạn gần thi, đặc biệt là khoảng{' '}
          <strong className="text-slate-800">3 tháng trước ngày thi chính thức</strong>. Đây là thời điểm hợp lý để
          người học tăng cường luyện đề, làm quen áp lực thời gian, nhận diện dạng bài thường gặp và điều chỉnh chiến
          lược làm bài.
        </p>
        <p>
          IELTS Practice Platform cung cấp hệ thống đề luyện thi IELTS được chọn lọc dựa trên cấu trúc, độ khó và xu
          hướng ra đề thực tế (100% đã ra thi thật). Giao diện làm bài được mô phỏng gần với môi trường thi thật, giúp
          người học rèn luyện thao tác, quản lý thời gian và giữ nhịp làm bài như khi bước vào phòng thi.
        </p>
        <p>
          Để đạt hiệu quả tốt nhất, người học nên kết hợp luyện đề với việc ôn lại từ vựng sau mỗi bài làm. Với kỹ năng{' '}
          <strong className="text-slate-800">Listening</strong>, việc đọc lại script sau khi nghe giúp người học nhận
          diện lỗi nghe, mở rộng vốn từ và cải thiện khả năng bắt ý trong các lần luyện tiếp theo.
        </p>
        <p>
          Với kỹ năng <strong className="text-slate-800">Writing</strong>, hệ thống tích hợp AI để hỗ trợ chấm điểm,
          phân tích lỗi, đề xuất cách nâng band và gợi ý cải thiện bài viết. Người học có thể tham khảo idea, cách triển
          khai luận điểm, từ vựng và cấu trúc câu từ bài mẫu đề xuất để cải thiện band nhanh và hiệu quả hơn.
        </p>
        <p>
          Kết quả chấm Writing đã được kiểm nghiệm nội bộ với độ tương quan band ước tính khoảng{' '}
          <strong className="text-slate-800">80–90%</strong> trong các điều kiện đánh giá phù hợp, giúp người học có
          thêm cơ sở để tự luyện tập và nâng cao chất lượng bài viết.
        </p>
        <p>
          <strong className="text-slate-800">IELTS Practice Platform</strong> hướng đến việc trở thành công cụ luyện
          thi thực tế, linh hoạt và hiệu quả cho người học IELTS ở nhiều trình độ, đặc biệt là những người cần luyện đề
          chuyên sâu trong giai đoạn nước rút trước kỳ thi.
        </p>
      </div>
    </div>
  )
}
