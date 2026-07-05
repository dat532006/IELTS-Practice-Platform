import { Logo } from '@/components/brand/Logo'

// Auth shell (handoff): nền radial-blob (coral top-right, violet top-left) trên #FBF9FF,
// logo lockup phía trên, mỗi form tự render card trắng + footer link riêng.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12"
      style={{
        background:
          'radial-gradient(120% 80% at 88% -8%,#FBE6DC 0%,rgba(251,230,220,0) 52%),radial-gradient(90% 60% at 4% -4%,#EFEAFF 0%,rgba(239,234,255,0) 48%),#FBF9FF',
      }}
    >
      {/* soft blobs + sparkle */}
      <span className="pointer-events-none absolute right-[8%] top-[8%] h-[120px] w-[120px] rounded-full bg-[radial-gradient(circle_at_35%_35%,#FFE3D2,#FFCEB6)] opacity-70" />
      <span className="pointer-events-none absolute bottom-[12%] left-[6%] h-[104px] w-[104px] rounded-full bg-[radial-gradient(circle_at_40%_40%,#E9E0FF,#D6C6FF)] opacity-70" />

      <div className="relative flex w-full max-w-[440px] flex-col items-center">
        <Logo size={46} textClassName="text-[20px]" />
        <div className="mt-[26px] w-full">{children}</div>
      </div>
    </div>
  )
}
