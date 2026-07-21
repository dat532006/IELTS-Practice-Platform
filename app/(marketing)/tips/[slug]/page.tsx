import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { TIP_ARTICLES, TIP_SKILL, TIP_TYPE_LABEL, getTip, relatedTips } from '@/lib/tips/articles'

export function generateStaticParams() {
  return TIP_ARTICLES.map((a) => ({ slug: a.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const article = getTip(slug)
  if (!article) return { title: 'Không tìm thấy bài viết' }
  return { title: article.title, description: article.excerpt }
}

export default async function TipArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = getTip(slug)
  if (!article) notFound()

  const sk = TIP_SKILL[article.skill]
  const related = relatedTips(article)

  return (
    <div className="mx-auto max-w-[760px] px-4 pb-20 text-[#2A2740]">
      <div className="pt-8">
        <Link
          href="/tips"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-[11px] border border-[#E8E2F0] bg-white px-[15px] text-[13.5px] font-bold text-[#3D3654] transition hover:border-[#D9D2E6]"
        >
          ← Tất cả tips
        </Link>
      </div>

      {/* Đầu bài */}
      <div className="mt-6">
        <span
          className="inline-flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[0.06em]"
          style={{ color: sk.text }}
        >
          <span aria-hidden="true" className="inline-block h-[9px] w-[9px] rotate-45 rounded-[3px]" style={{ background: sk.color }} />
          {sk.label} · {TIP_TYPE_LABEL[article.type]}
        </span>
        <h1 className="mt-4 text-[clamp(27px,4.5vw,38px)] font-extrabold leading-[1.12] tracking-[-0.03em]">
          {article.title}
        </h1>
        <div className="mt-[22px] flex items-center gap-3.5">
          <span className="flex h-[46px] w-[46px] items-center justify-center rounded-[13px] bg-[#F0ECFF] text-[15px] font-extrabold text-[#6A48D6]">
            {article.initials}
          </span>
          <div>
            <div className="text-[14.5px] font-extrabold">
              {article.author} · {article.band}
            </div>
            <div className="text-[12.5px] font-semibold text-[var(--text-subtle)]">
              {article.date} · {article.read}
            </div>
          </div>
        </div>
      </div>

      {/* Ảnh minh hoạ (placeholder gradient) */}
      <div
        aria-hidden="true"
        className="mt-[26px] flex aspect-[16/8] items-center justify-center rounded-[22px]"
        style={{ backgroundImage: sk.cover }}
      />

      {/* Thân bài — NỘI DUNG MẪU (placeholder), Owner thay bài thật sau */}
      <article className="mt-[30px] text-[17px] leading-[1.75] text-[#3A3550]">
        <p className="mb-5 text-[18.5px] font-semibold leading-[1.7] text-[#2A2740]">{article.excerpt}</p>
        <p className="mb-5">
          Trước khi vào chi tiết, hãy nhớ nguyên tắc cốt lõi: giám khảo chấm theo{' '}
          <em className="font-serif text-[#6A48D6] italic">tiêu chí</em>, không chấm theo cảm tính. Vì vậy mọi chiến
          thuật dưới đây đều xoay quanh việc bám sát band descriptors và luyện tập có mục tiêu.
        </p>
        <h2 className="mb-3.5 mt-[34px] text-[23px] font-extrabold tracking-[-0.02em]">
          Vì sao dạng này khiến nhiều bạn mất điểm
        </h2>
        <p className="mb-5">
          Phần lớn lỗi sai không đến từ vốn từ mà đến từ cách đọc lướt sai chỗ, hiểu sai yêu cầu đề và quản lý thời gian
          kém. Khi bạn hệ thống lại quy trình, tỉ lệ đúng tăng rõ rệt chỉ sau vài buổi luyện.
        </p>
        <div className="my-[26px] rounded-[16px] border border-dashed border-[#DDD3F2] bg-[#FAF8FF] p-[20px_22px]">
          <div className="text-[12.5px] font-extrabold uppercase tracking-[0.05em] text-[#6A48D6]">Mẹo nhanh</div>
          <p className="mt-2 text-[15.5px] leading-[1.6] text-[#4A445E]">
            Gạch chân từ khoá định vị (tên riêng, số, năm) trước — chúng là “mỏ neo” giúp bạn quét đúng đoạn chứa đáp án
            mà không phải đọc lại toàn bài.
          </p>
        </div>
        <h2 className="mb-3.5 mt-[34px] text-[23px] font-extrabold tracking-[-0.02em]">Quy trình từng bước</h2>
        <ol className="mb-5 list-decimal pl-[22px]">
          <li className="mb-2.5">Đọc câu hỏi và xác định từ khoá không thể thay thế.</li>
          <li className="mb-2.5">Quét (scan) đoạn văn để định vị vùng chứa thông tin.</li>
          <li className="mb-2.5">Đọc kỹ (read closely) đúng vùng đó, đối chiếu nghĩa — không đối chiếu từ.</li>
          <li className="mb-2.5">Quyết định dựa trên bằng chứng trong bài, không dựa vào kiến thức nền.</li>
        </ol>
        <p className="mb-5">
          Luyện đúng quy trình này trên các bộ đề thi thật, mỗi ngày 1 passage, band của bạn sẽ ổn định hơn hẳn chỉ sau
          2 tuần.
        </p>
      </article>

      {/* Bài liên quan */}
      {related.length > 0 && (
        <div className="mt-10 border-t border-[#EEE7F3] pt-7">
          <div className="text-[12px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-subtle)]">
            Bài liên quan
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {related.map((r) => {
              const rsk = TIP_SKILL[r.skill]
              return (
                <Link
                  key={r.slug}
                  href={`/tips/${r.slug}`}
                  className="flex items-center gap-3.5 rounded-[16px] border border-[#EEEAF3] bg-white p-3.5 transition hover:border-[#D9D2E6]"
                >
                  <span aria-hidden="true" className="h-[58px] w-[58px] flex-none rounded-[12px]" style={{ backgroundImage: rsk.cover }} />
                  <div>
                    <div className="text-[11px] font-extrabold uppercase tracking-[0.05em]" style={{ color: rsk.text }}>
                      {rsk.label}
                    </div>
                    <div className="mt-1 text-[14.5px] font-extrabold leading-[1.3] text-[#2A2740]">{r.title}</div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
