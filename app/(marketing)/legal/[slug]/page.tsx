import { notFound } from 'next/navigation'
import { LEGAL_PAGES, LEGAL_SLUGS, type LegalSlug } from '@/lib/legal'

export function generateStaticParams() {
  return LEGAL_SLUGS.map((slug) => ({ slug }))
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!(slug in LEGAL_PAGES)) notFound()
  const page = LEGAL_PAGES[slug as LegalSlug]
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900">{page.title}</h1>
      {page.updated && <p className="mt-1 text-xs text-slate-400">Cập nhật lần cuối: {page.updated}</p>}
      <p className="mt-4 leading-relaxed text-slate-600">{page.summary}</p>

      <div className="mt-8 space-y-6">
        {page.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-base font-semibold text-violet-700">{section.heading}</h2>
            <div className="mt-2 space-y-2">
              {section.blocks.map((block, i) =>
                'list' in block ? (
                  <ul key={i} className="list-disc space-y-1 pl-5 leading-relaxed text-slate-600">
                    {block.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p key={i} className="leading-relaxed text-slate-600">
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
