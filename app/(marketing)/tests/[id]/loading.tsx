// Loading skeleton cho /tests/[id] (pre-exam).
export default function PreExamLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="h-3 w-40 animate-pulse rounded bg-slate-200" />
      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-6">
        <div className="h-7 w-2/3 animate-pulse rounded bg-slate-200" />
        <div className="mt-4 grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
        <div className="mt-6 h-11 w-40 animate-pulse rounded-md bg-slate-200" />
      </div>
    </div>
  )
}
