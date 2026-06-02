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
      <h1 className="text-2xl font-bold">{page.title}</h1>
      <p className="mt-4 leading-relaxed text-slate-600">{page.body}</p>
    </div>
  )
}
