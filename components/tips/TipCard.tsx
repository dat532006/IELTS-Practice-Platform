import Link from 'next/link'
import { TIP_SKILL, TIP_TYPE_LABEL, type TipArticle } from '@/lib/tips/articles'

// Thẻ bài viết trong lưới Tips. Cover = gradient theo kỹ năng (trang trí), nhãn kỹ năng·dạng là chữ thật.
export function TipCard({ article }: { article: TipArticle }) {
  const sk = TIP_SKILL[article.skill]
  return (
    <Link
      href={`/tips/${article.slug}`}
      className="group flex flex-col overflow-hidden rounded-[20px] border border-[#EEEAF3] bg-white shadow-[0_16px_34px_-24px_rgba(60,40,90,0.36)] transition hover:-translate-y-1 hover:shadow-[0_26px_50px_-26px_rgba(60,40,90,0.42)]"
    >
      <div
        className="relative flex aspect-[16/9] items-end p-[15px]"
        style={{ backgroundImage: sk.cover }}
      >
        {article.coverImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={article.coverImage} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full" style={{ objectFit: article.coverFit }} />
        )}
        <span className="relative inline-flex items-center gap-1.5 rounded-full bg-black/45 px-[11px] py-[5px] text-[11px] font-extrabold uppercase tracking-[0.07em] text-white">
          {sk.label} · {TIP_TYPE_LABEL[article.type]}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-[11px] p-[18px_19px_19px]">
        <h3 className="text-[17.5px] font-extrabold leading-[1.32] tracking-[-0.01em] text-[#2A2740] transition-colors group-hover:text-[#6A48D6]">
          {article.title}
        </h3>
        <p className="text-[14px] leading-[1.55] text-[#6A6480]">{article.excerpt}</p>
        <div className="mt-auto flex items-center gap-2.5 pt-1.5 text-[12.5px] font-semibold text-[var(--text-subtle)]">
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-[#F0ECFF] text-[11px] font-extrabold text-[#6A48D6]">
            {article.initials}
          </span>
          {article.author}
          <span className="h-1 w-1 rounded-full bg-[#D2CCDD]" />
          {article.read}
        </div>
      </div>
    </Link>
  )
}
