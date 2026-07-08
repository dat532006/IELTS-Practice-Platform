// Loading state cho /dashboard (+history/vocab con) — skeleton stat + chart (nav-lag fix 2026-07-08).
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-[16px] bg-slate-100" />
        ))}
      </div>
      <div className="mt-6 h-64 animate-pulse rounded-[16px] bg-slate-100" />
    </div>
  )
}
