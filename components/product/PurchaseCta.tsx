import { BuyButtons } from './BuyButtons'
import { PaymentDisclaimer } from '@/components/payment/PaymentDisclaimer'
import { FishBone } from '@/components/brand/FishBone'
import { CheckIcon } from '@/components/brand/icons'

// Panel CTA mua product detail (M08, W16). owned / free / buy — layout theo design handoff (aside).
// ⚠️ Normal purchase flow KHÔNG dùng activation code → KHÔNG nút "Nhập mã" (redeem chỉ cho admin/offline).
// price_coins server-authoritative; ở đây chỉ hiển thị. 1 xương cá = 1.000 ₫ (fixed-rate).

function IncludedItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 text-[13.5px] font-semibold text-[#4A445E]">
      <span className="flex h-5 w-5 flex-none items-center justify-center rounded-[6px] bg-[#E7F7EE] text-[var(--text-success)]">
        <CheckIcon size={12} strokeWidth={3.2} />
      </span>
      {children}
    </div>
  )
}

function Included({ testCount }: { testCount?: number }) {
  return (
    <div className="mt-5 border-t border-[#EDE8F3] pt-5">
      <div className="text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-[#2A2740]">
        Gồm những gì
      </div>
      <div className="mt-3.5 flex flex-col gap-3">
        <IncludedItem>{testCount ? `${testCount} đề full-length` : 'Trọn bộ đề'}</IncludedItem>
        <IncludedItem>Giao diện thi máy như thật</IncludedItem>
        <IncludedItem>Chấm điểm server-side</IncludedItem>
        <IncludedItem>Đáp án chi tiết, có giải thích</IncludedItem>
      </div>
    </div>
  )
}

export function PurchaseCta({
  productId,
  priceCoins,
  owned,
  testCount,
}: {
  productId: string
  priceCoins: number
  owned: boolean
  testCount?: number
}) {
  return (
    <div className="min-w-0 rounded-[20px] border border-[#EEEAF3] bg-white p-6 text-[#2A2740] shadow-[0_26px_50px_-30px_rgba(90,60,160,0.4)]">
      {owned ? (
        <>
          <div className="inline-flex items-center gap-2 rounded-full bg-[#E7F7EE] px-3.5 py-[7px] text-[13px] font-extrabold text-[var(--text-success)]">
            ✓ Đã sở hữu bộ đề
          </div>
          <p className="mt-3.5 text-[14px] leading-[1.6] text-[#5C5670]">
            Bạn đã mở khoá toàn bộ bộ đề. Bắt đầu hoặc tiếp tục bài làm bất cứ lúc nào.
          </p>
          <a
            href="#muc-luc"
            className="mt-[18px] flex w-full items-center justify-center gap-2 rounded-[13px] bg-[#7C5CE6] p-[15px] text-[15.5px] font-bold text-white shadow-[0_14px_28px_-10px_rgba(124,92,230,0.5)] transition hover:bg-[#6A48D6]"
          >
            Vào làm bài →
          </a>
          <Included testCount={testCount} />
        </>
      ) : priceCoins === 0 ? (
        <>
          <div className="inline-flex items-center gap-2 rounded-full bg-[#E7F7EE] px-3.5 py-[7px] text-[13px] font-extrabold text-[var(--text-success)]">
            Miễn phí
          </div>
          <p className="mt-3.5 text-[14px] leading-[1.6] text-[#5C5670]">
            Bộ đề này hoàn toàn miễn phí — không cần xương cá. Làm ngay không giới hạn.
          </p>
          <a
            href="#muc-luc"
            className="mt-[18px] flex w-full items-center justify-center gap-2 rounded-[13px] bg-[#1E9E63] p-[15px] text-[15.5px] font-bold text-white shadow-[0_14px_28px_-10px_rgba(30,158,99,0.4)] transition hover:bg-[#188152]"
          >
            Làm ngay →
          </a>
          <Included testCount={testCount} />
        </>
      ) : (
        <>
          <div className="text-[12.5px] font-bold text-[var(--text-subtle)]">Mở khoá cả bộ đề</div>
          <div className="mt-2 flex items-baseline gap-2.5">
            <span className="flex items-center gap-2 text-[34px] font-extrabold tracking-[-0.02em] text-[#2A2740]">
              <FishBone /> {priceCoins}
            </span>
          </div>
          <div className="mt-1 text-[13.5px] font-semibold text-[var(--text-muted)]">
            ≈ {(priceCoins * 1000).toLocaleString('vi-VN')} ₫ · một lần, không hết hạn
          </div>
          <BuyButtons productId={productId} priceCoins={priceCoins} />
          <PaymentDisclaimer className="mt-4" />
          <Included testCount={testCount} />
        </>
      )}
    </div>
  )
}
