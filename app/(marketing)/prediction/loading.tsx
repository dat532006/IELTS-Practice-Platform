// Loading state cho /prediction (nav-lag fix 2026-07-08).
export default function PredictionLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="h-7 w-48 animate-pulse rounded bg-slate-200" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-48 animate-pulse rounded-lg bg-slate-100" />
        ))}
      </div>
    </div>
  )
}
