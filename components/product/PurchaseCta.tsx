import { BuyButtons } from './BuyButtons'

// Panel CTA mua product detail (M08, W16). owned / free / buy — layout theo design frame 2.
// ⚠️ Normal purchase flow KHÔNG dùng activation code → KHÔNG nút "Nhập mã" (redeem chỉ cho admin/offline).
// price_coins server-authoritative; ở đây chỉ hiển thị.

function TrustFooter() {
  const Item = ({ children }: { children: React.ReactNode }) => (
    <div className="flex items-center gap-2.5 text-[13px] font-semibold text-[#564F6B]">
      <span className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[6px] bg-[#F0ECFF]">
        <span className="block h-[6px] w-[6px] rotate-45 rounded-[2px] bg-[#7C5CE6]" />
      </span>
      {children}
    </div>
  )
  return (
    <div className="mt-5 flex flex-col gap-2.5 border-t border-[#F0ECF6] pt-4">
      <Item>Giao diện thi máy như thật</Item>
      <Item>Chấm điểm server-side, có giải thích</Item>
    </div>
  )
}

export function PurchaseCta({
  productId,
  priceCoins,
  owned,
}: {
  productId: string
  priceCoins: number
  owned: boolean
}) {
  return (
    <div className="rounded-[20px] border border-[#ECE7F4] bg-white p-6 text-[#2A2740] shadow-[0_22px_46px_-28px_rgba(60,40,90,0.4)]">
      {owned ? (
        <>
          <div className="inline-flex items-center gap-2 rounded-full bg-[#E7F7EE] px-3.5 py-[7px] text-[13px] font-extrabold text-[#1E9E63]">
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
        </>
      ) : priceCoins === 0 ? (
        <>
          <div className="inline-flex items-center gap-2 rounded-full bg-[#E7F7EE] px-3.5 py-[7px] text-[13px] font-extrabold text-[#1E9E63]">
            Miễn phí
          </div>
          <p className="mt-3.5 text-[14px] leading-[1.6] text-[#5C5670]">
            Bộ đề này hoàn toàn miễn phí — không cần coin. Làm ngay không giới hạn.
          </p>
          <a
            href="#muc-luc"
            className="mt-[18px] flex w-full items-center justify-center gap-2 rounded-[13px] bg-[#1E9E63] p-[15px] text-[15.5px] font-bold text-white shadow-[0_14px_28px_-10px_rgba(30,158,99,0.4)] transition hover:bg-[#188152]"
          >
            Làm ngay →
          </a>
        </>
      ) : (
        <>
          <div className="text-[12.5px] font-bold uppercase tracking-[0.05em] text-[#9D96AE]">Giá bộ đề</div>
          <div className="mt-[7px] flex items-baseline gap-2">
            <span className="text-[34px] font-extrabold tracking-[-0.02em] text-[#2A2740]">🪙 {priceCoins}</span>
            <span className="text-[14px] font-bold text-[#857F96]">coins</span>
          </div>
          <BuyButtons productId={productId} priceCoins={priceCoins} />
        </>
      )}

      <TrustFooter />
    </div>
  )
}
