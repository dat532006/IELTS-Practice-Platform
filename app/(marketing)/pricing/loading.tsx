// Loading state cho /pricing — skeleton card nạp xương cá (nav-lag fix 2026-07-08).
export default function PricingLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="overflow-hidden rounded-[24px] border border-[#EEEAF3] bg-white p-9">
        <div className="h-7 w-56 animate-pulse rounded bg-slate-200" />
        <div className="mt-4 h-4 w-full animate-pulse rounded bg-slate-100" />
        <div className="mt-7 grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-[14px] bg-slate-100" />
          ))}
        </div>
        <div className="mt-6 h-14 animate-pulse rounded-[14px] bg-slate-100" />
        <div className="mt-6 h-24 animate-pulse rounded-[16px] bg-slate-100" />
      </div>
    </div>
  )
}
