import type { Metadata } from 'next'
import Link from 'next/link'
import { TIP_SKILL, TIP_TYPE_LABEL } from '@/lib/tips/articles'
import { listPublishedTips } from '@/lib/tips/queries'
import { TipsExplorer } from '@/components/tips/TipsExplorer'

export const metadata: Metadata = {
  title: 'Tips & Chiến thuật IELTS',
  description:
    'Chiến thuật phòng thi, mẹo xử lý dạng bài khó và lộ trình tăng band IELTS theo từng kỹ năng — biên soạn từ đề thi thật.',
}

export default async function TipsPage() {
  const articles = await listPublishedTips()
  // listPublishedTips xếp featured lên đầu → bài đầu là "Bài nổi bật"; phần còn lại vào lưới (không trùng).
  const [featured, ...rest] = articles
  const fsk = featured ? TIP_SKILL[featured.skill] : null

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 text-[#2A2740]">
      {/* Hero */}
      <div>
        <span className="inline-flex items-center gap-2 rounded-full bg-[#F0ECFF] px-3.5 py-2 text-[13px] font-bold text-[#6A48D6]">
          <span aria-hidden="true" className="block h-[7px] w-[7px] rounded-full bg-[#7C5CE6]" />
          Tips &amp; Chiến thuật
        </span>
        <h1 className="mt-5 text-[clamp(30px,5vw,44px)] font-extrabold leading-[1.05] tracking-[-0.03em]">
          Bí kíp luyện{' '}
          <span className="font-serif text-[#6A48D6] italic [font-weight:500]">IELTS</span> theo từng kỹ năng
        </h1>
        <p className="mt-4 max-w-[38em] text-[17px] leading-[1.6] text-[#5C5670]">
          Chiến thuật phòng thi, mẹo xử lý dạng bài khó và lộ trình tăng band — biên soạn từ đề thi thật.
        </p>
      </div>

      {articles.length === 0 ? (
        <p className="mt-16 mb-16 text-center text-[15px] font-semibold text-[var(--text-subtle)]">
          Chưa có bài viết nào. Nội dung đang được biên soạn.
        </p>
      ) : (
        <>
          {/* Bài nổi bật */}
          {featured && fsk && (
            <Link
              href={`/tips/${featured.slug}`}
              className="group mt-8 grid overflow-hidden rounded-[26px] border border-[#EEEAF3] bg-white shadow-[0_26px_60px_-34px_rgba(60,40,90,0.5)] transition hover:shadow-[0_30px_64px_-32px_rgba(60,40,90,0.55)] md:grid-cols-[1.05fr_0.95fr]"
            >
              <div
                className="relative flex min-h-[240px] items-end overflow-hidden p-[30px]"
                style={{ backgroundImage: 'linear-gradient(140deg,#8A6BF0 0%,#6A48D6 60%,#F2724E 130%)' }}
              >
                {featured.coverImage && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={featured.coverImage} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
                    {/* Lớp phủ tối để nhãn/chữ trắng luôn đọc được trên ảnh bất kỳ */}
                    <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(140deg,rgba(42,39,64,0.55),rgba(42,39,64,0.2))]" />
                  </>
                )}
                <span className="absolute left-[26px] top-6 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-white backdrop-blur-[4px]">
                  ★ Bài nổi bật
                </span>
                <span className="relative z-10 inline-flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[0.06em] text-white/90">
                  <span className="inline-block h-[9px] w-[9px] rotate-45 rounded-[3px] bg-[#FFD9C7]" />
                  {fsk.label} · {TIP_TYPE_LABEL[featured.type]}
                </span>
              </div>
              <div className="flex flex-col justify-center p-[34px_36px]">
                <h2 className="text-[clamp(22px,3vw,27px)] font-extrabold leading-[1.22] tracking-[-0.02em] group-hover:text-[#6A48D6]">
                  {featured.title}
                </h2>
                <p className="mt-4 text-[15.5px] leading-[1.65] text-[#5C5670]">{featured.excerpt}</p>
                <div className="mt-6 flex items-center gap-3.5">
                  <span className="flex h-[42px] w-[42px] items-center justify-center rounded-xl bg-[#F0ECFF] text-[14px] font-extrabold text-[#6A48D6]">
                    {featured.initials}
                  </span>
                  <div>
                    <div className="text-[14px] font-extrabold">
                      {featured.author}
                      {featured.band && ` · ${featured.band}`}
                    </div>
                    <div className="text-[12.5px] font-semibold text-[var(--text-subtle)]">
                      {featured.date}
                      {featured.date && ' · '}
                      {featured.read}
                    </div>
                  </div>
                  <span className="ml-auto hidden items-center gap-2 text-[14.5px] font-extrabold text-[#6A48D6] sm:inline-flex">
                    Đọc bài →
                  </span>
                </div>
              </div>
            </Link>
          )}

          {/* Lọc + lưới bài viết (đã trừ bài nổi bật để không hiện trùng) */}
          {rest.length > 0 && <TipsExplorer articles={rest} />}
        </>
      )}
    </div>
  )
}
