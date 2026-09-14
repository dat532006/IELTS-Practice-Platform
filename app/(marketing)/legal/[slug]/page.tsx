import { notFound } from 'next/navigation'
import { LEGAL_PAGES, LEGAL_SLUGS, type LegalSlug } from '@/lib/legal'

export function generateStaticParams() {
  return LEGAL_SLUGS.map((slug) => ({ slug }))
}

// Màu/thang chữ theo token dự án (tiêu đề #2A2740 như /products · /pricing, meta --text-muted, violet thương hiệu
// #6A48D6 cho tiêu đề mục) thay palette slate/violet mặc định của Tailwind. Đoạn văn giới hạn 36em (~75 ký tự/dòng; KHÔNG dùng ch: số 0 của Plus Jakarta rộng 0.73em nên 68ch > khung 736px, vô tác dụng).
export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!(slug in LEGAL_PAGES)) notFound()
  const page = LEGAL_PAGES[slug as LegalSlug]
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-[#2A2740]">
      <h1 className="text-[32px] font-extrabold leading-[1.1] tracking-[-0.03em]">{page.title}</h1>
      {page.updated && (
        <p className="mt-2 text-[13px] font-semibold text-[var(--text-muted)]">Cập nhật lần cuối: {page.updated}</p>
      )}
      <p className="mt-4 max-w-[36em] leading-relaxed text-[#4A445E]">{page.summary}</p>

      <div className="mt-8 max-w-[36em] space-y-6">
        {page.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-[17px] font-extrabold tracking-[-0.01em] text-[#6A48D6]">{section.heading}</h2>
            <div className="mt-2 space-y-2">
              {section.blocks.map((block, i) =>
                'list' in block ? (
                  <ul key={i} className="list-disc space-y-1 pl-5 leading-relaxed text-[#4A445E]">
                    {block.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p key={i} className="leading-relaxed text-[#4A445E]">
                    {block.p}
                  </p>
                ),
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
