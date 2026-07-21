import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { TIP_SKILL, TIP_TYPE_LABEL } from '@/lib/tips/articles'
import { getPublishedTip, relatedPublishedTips } from '@/lib/tips/queries'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const found = await getPublishedTip(slug)
  if (!found) return { title: 'Không tìm thấy bài viết' }
  return { title: found.article.title, description: found.article.excerpt }
}

export default async function TipArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const found = await getPublishedTip(slug)
  if (!found) notFound()
  const { article, bodyHtml } = found

  const sk = TIP_SKILL[article.skill]
  const related = await relatedPublishedTips(article)

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
              {article.author}
              {article.band && ` · ${article.band}`}
            </div>
            <div className="text-[12.5px] font-semibold text-[var(--text-subtle)]">
              {article.date}
              {article.date && ' · '}
              {article.read}
            </div>
          </div>
        </div>
      </div>

      {/* Ảnh minh hoạ (placeholder gradient) */}
      <div
        aria-hidden="true"
        className="mt-[26px] aspect-[16/8] rounded-[22px]"
        style={{ backgroundImage: sk.cover }}
      />

      {/* Thân bài — HTML admin soạn (đã sanitize allowlist ở server). */}
      {bodyHtml ? (
        <article className="tip-prose mt-[30px]" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      ) : (
        <p className="mt-[30px] text-[15px] text-[var(--text-subtle)]">Nội dung bài viết đang được cập nhật.</p>
      )}

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
