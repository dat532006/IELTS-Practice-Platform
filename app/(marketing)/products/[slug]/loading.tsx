// Loading skeleton cho /products/[slug] (server fetch detail).
export default function ProductDetailLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="h-3 w-40 animate-pulse rounded bg-slate-200" />
      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div>
          <div className="aspect-[16/7] animate-pulse rounded-lg bg-slate-100" />
          <div className="mt-4 h-7 w-2/3 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-4 w-32 animate-pulse rounded bg-slate-100" />
          <div className="mt-6 h-48 animate-pulse rounded-lg bg-slate-100" />
        </div>
        <div className="hidden lg:block">
          <div className="h-40 animate-pulse rounded-lg bg-slate-100" />
        </div>
      </div>
    </div>
  )
}
