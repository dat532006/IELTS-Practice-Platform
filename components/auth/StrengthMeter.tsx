import { PASSWORD_LEVELS } from '@/lib/auth/password'

// Thanh độ mạnh 3 segment + nhãn màu. `level`: -1 ẩn, 0 Yếu, 1 Trung bình, 2 Mạnh.
export function StrengthMeter({ level }: { level: number }) {
  if (level < 0) return null
  const meta = PASSWORD_LEVELS[level]
  return (
    <div className="mt-2.5">
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-[5px] flex-1 rounded-full transition-colors"
            style={{ background: i < meta.segs ? meta.color : '#EDE8F3' }}
          />
        ))}
      </div>
      <p className="mt-[7px] text-[12px] font-bold" style={{ color: meta.text }}>
        {meta.label} · {meta.hint}
      </p>
    </div>
  )
}
