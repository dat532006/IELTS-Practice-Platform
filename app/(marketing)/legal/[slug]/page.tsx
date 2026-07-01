import { notFound } from 'next/navigation'
import { LEGAL_PAGES, LEGAL_SLUGS, LEGAL_DRAFT_NOTICE, type LegalSlug } from '@/lib/legal'

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
      <p className="mt-1 text-xs text-slate-400">Cập nhật: {page.updated}</p>
      <p className="mt-4 leading-relaxed text-slate-600">{page.summary}</p>

      <div className="mt-8 space-y-6">
        {page.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-base font-semibold text-violet-700">{section.heading}</h2>
            <p className="mt-2 leading-relaxed text-slate-600">{section.body}</p>
          </section>
        ))}
      </div>

      <p className="mt-10 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-700">
        {LEGAL_DRAFT_NOTICE}
      </p>
    </div>
  )
}
