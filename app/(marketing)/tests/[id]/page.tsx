import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTestMeta } from '@/lib/exam/meta'
import { canEnterExam, deriveTestUiState, formatDurationMin } from '@/lib/products/access-state'
import { skillMeta, SkillGlyph } from '@/components/brand/skill'
import { FishBone } from '@/components/brand/FishBone'
import { isUuid } from '@/lib/utils'
import { testEntryPath } from '@/lib/exam/entry-route'
import type { ExamSkill } from '@/types/exam'

// W4 — Pre-exam page (M05). Server component đọc getTestMeta (SAFE metadata, KHÔNG payload).
//   CTA theo access-state: free/unlocked → route theo kỹ năng; locked → login (guest) / mua bundle (auth).
// 2026-07 redesign: đưa body về ngôn ngữ thương hiệu (tím/san hô) như homepage & product detail.
//   Header/Footer giữ nguyên. KHÔNG đổi data-fetch/access-logic — chỉ trình bày.

// Nền pastel header thẻ theo kỹ năng (token README §2; accent + glyph lấy từ hệ skill dùng chung).
const SKILL_SOFT: Record<ExamSkill, string> = {
  reading: '#FFEDE6',
  listening: '#FFF3DC',
  writing: '#F0ECFF',
}

// Ký tự "watermark" trên cover: số đuôi tiêu đề ("… TEST 01" → "01"), fallback chữ cái đầu.
function coverMono(title: string): string {
  const num = title.match(/(\d{1,3})\s*$/)
  if (num) return num[1].padStart(2, '0')
  const ch = title.match(/[a-z0-9]/i)
  return (ch?.[0] ?? '?').toUpperCase()
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C5CE6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  )
}

function BarsIcon() {
  return (
    <svg width="17" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="13" width="3.4" height="6" rx="1.7" fill="#ECA22B" />
      <rect x="10.3" y="9" width="3.4" height="10" rx="1.7" fill="#ECA22B" />
      <rect x="16.6" y="5" width="3.4" height="14" rx="1.7" fill="#ECA22B" />
    </svg>
  )
}

export default async function PreExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) notFound() // id sai định dạng → 404 (tránh lỗi DB)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const meta = await getTestMeta(supabase, id, user?.id ?? null)
  if (!meta) notFound()

  const state = deriveTestUiState(meta, !!user)
  const canEnter = canEnterExam(meta)

  // Trình bày (KHÔNG phải access-logic): accent/label/glyph theo kỹ năng + badge/CTA theo state.
  const sk = skillMeta(meta.skill)
  const accent = sk.color
  const soft = SKILL_SOFT[meta.skill]
  const locked = state === 'locked_guest' || state === 'locked_auth'
  const badge = locked
    ? { text: '🔒 Khóa', cls: 'bg-[#FFF1DC] text-[#C98A1A]' }
    : state === 'unlocked'
      ? { text: '✓ Đã mở khóa', cls: 'bg-[#E7F7EE] text-[var(--text-success)]' }
      : { text: 'Miễn phí', cls: 'bg-[#E7F7EE] text-[var(--text-success)]' }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 text-[#2A2740]">
      {/* Breadcrumb (brand) */}
      <nav className="text-[12.5px] font-semibold text-[var(--text-subtle)]">
        <Link href="/" className="hover:text-[#7C5CE6]">
          Trang chủ
        </Link>
        <span className="mx-1.5 text-[var(--text-subtle)]">/</span>
        <Link href="/products" className="hover:text-[#7C5CE6]">
          Bộ đề
        </Link>
        <span className="mx-1.5 text-[var(--text-subtle)]">/</span>
        <span className="text-[#564F6B]">{meta.title}</span>
      </nav>

      {/* Hero card */}
      <div
        className="relative mt-4 overflow-hidden rounded-[24px] border border-[#EEEAF3] shadow-[0_30px_60px_-38px_rgba(60,40,90,0.42)]"
        style={{ background: 'radial-gradient(120% 70% at 96% -8%, #FBE6DC 0%, rgba(251,230,220,0) 46%), #FFFFFF' }}
      >
        {/* Cover band theo kỹ năng: ảnh minh họa riêng của đề nếu có, else fallback trang trí + watermark */}
        <div className="relative h-[174px] overflow-hidden" style={{ background: soft }}>
          {meta.cover_image ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={meta.cover_image}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                // Khung cover cắt cứng → Owner chọn phần nào của ảnh lộ ra (admin: kéo + thanh zoom).
                //   50/50/100 = canh giữa, vừa khung — y hệt hành vi trước migration 20260726000100.
                style={{
                  objectPosition: `${meta.cover_pos_x}% ${meta.cover_pos_y}%`,
                  ...(meta.cover_zoom !== 100 ? { transform: `scale(${meta.cover_zoom / 100})` } : {}),
                }}
              />
              {/* Phủ nhẹ đỉnh để chip/pill nổi rõ trên mọi ảnh */}
              <span
                className="pointer-events-none absolute inset-0"
                style={{ background: 'linear-gradient(180deg, rgba(20,12,35,0.30) 0%, rgba(20,12,35,0) 46%)' }}
              />
            </>
          ) : (
            <>
              <span className="pointer-events-none absolute -right-6 -top-10 h-[150px] w-[150px] rounded-full bg-white/25" />
              <span
                className="pointer-events-none absolute -bottom-3 right-6 select-none text-[104px] font-extrabold leading-none"
                style={{ color: accent, opacity: 0.16 }}
              >
                {coverMono(meta.title)}
              </span>
              <span
                className="pointer-events-none absolute inset-0"
                style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 44%)' }}
              />
            </>
          )}
          <div className="absolute left-[18px] top-4 flex items-center gap-[11px]">
            <span
              className="flex h-11 w-11 flex-none items-center justify-center rounded-[13px] text-white"
              style={{ background: accent, boxShadow: `0 8px 18px -6px ${accent}` }}
            >
              <SkillGlyph skill={meta.skill} size={23} strokeWidth={1.9} />
            </span>
            <span
              className="inline-flex items-center rounded-full bg-white px-[13px] py-[6px] text-[12px] font-extrabold uppercase tracking-[0.05em] shadow-[0_4px_12px_-6px_rgba(60,40,90,0.28)]"
              style={{ color: accent }}
            >
              Bộ đề · {sk.coverLabel}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 pb-7 pt-6 sm:px-[30px] sm:pb-[30px]">
          <div className="flex items-start justify-between gap-3.5">
            <h1 className="min-w-0 flex-1 text-[25px] font-extrabold leading-[1.15] tracking-[-0.02em]">
              {meta.title}
            </h1>
            <span
              className={`flex-none whitespace-nowrap rounded-full px-3 py-[6px] text-[12.5px] font-extrabold ${badge.cls}`}
            >
              {badge.text}
            </span>
          </div>

          {/* Meta chips (an toàn — không có nội dung đề) */}
          <div className="mt-5 flex flex-wrap gap-3">
            <div className="flex items-center gap-[11px] rounded-[15px] border border-[#EFEAF6] bg-[#FAF8FF] px-[15px] py-[11px]">
              <span
                className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px]"
                style={{ background: soft, color: accent }}
              >
                <SkillGlyph skill={meta.skill} size={17} strokeWidth={2.2} />
              </span>
              <span className="whitespace-nowrap">
                <span className="block text-[11.5px] font-bold text-[var(--text-subtle)]">Kỹ năng</span>
                <span className="block text-[15px] font-extrabold text-[#2A2740]">{sk.label}</span>
              </span>
            </div>

            <div className="flex items-center gap-[11px] rounded-[15px] border border-[#EFEAF6] bg-[#FAF8FF] px-[15px] py-[11px]">
              <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-[#F0ECFF]">
                <ClockIcon />
              </span>
              <span className="whitespace-nowrap">
                <span className="block text-[11.5px] font-bold text-[var(--text-subtle)]">Thời lượng</span>
                <span className="block text-[15px] font-extrabold text-[#2A2740]">
                  {formatDurationMin(meta.duration_sec)}
                </span>
              </span>
            </div>

            {meta.difficulty != null && (
              <div className="flex items-center gap-[11px] rounded-[15px] border border-[#EFEAF6] bg-[#FAF8FF] px-[15px] py-[11px]">
                <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-[#FFF3DC]">
                  <BarsIcon />
                </span>
                <span className="whitespace-nowrap">
                  <span className="block text-[11.5px] font-bold text-[var(--text-subtle)]">Độ khó</span>
                  <span className="block text-[15px] font-extrabold text-[#2A2740]">{meta.difficulty}/5</span>
                </span>
              </div>
            )}
          </div>

          {meta.question_types.length > 0 && (
            <div className="mt-[18px]">
              <div className="text-[11.5px] font-bold text-[var(--text-subtle)]">Dạng câu hỏi</div>
              <div className="mt-[9px] flex flex-wrap gap-[7px]">
                {meta.question_types.map((qt) => (
                  <span
                    key={qt}
                    className="rounded-[8px] bg-[#F0ECFF] px-[11px] py-[5px] text-[12px] font-bold text-[#6A4BD0]"
                  >
                    {qt}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="my-6 h-px bg-[#EFEAF6]" />

          {/* CTA theo access-state — href/logic GIỮ NGUYÊN như bản cũ, chỉ đổi style */}
          {canEnter ? (
            <>
              <Link
                href={testEntryPath(meta.skill, meta.id)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#7C5CE6] px-[26px] py-[15px] text-[15.5px] font-bold text-white shadow-[0_12px_28px_rgba(124,92,230,0.3)] transition hover:bg-[#6A48D6] sm:w-auto"
              >
                {meta.is_free ? 'Bắt đầu làm bài →' : 'Vào làm bài →'}
              </Link>
              <p className="mt-3.5 max-w-[34em] text-[13px] font-semibold leading-[1.55] text-[var(--text-muted)]">
                {meta.is_free
                  ? 'Miễn phí · không cần xương cá · kết quả chấm tự động ngay khi nộp bài.'
                  : 'Bạn đã mở khóa đề này — vào làm bài bất cứ lúc nào, kết quả chấm ngay khi nộp bài.'}
              </p>
            </>
          ) : state === 'locked_guest' ? (
            <>
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#7C5CE6] px-[26px] py-[15px] text-[15.5px] font-bold text-white shadow-[0_12px_28px_rgba(124,92,230,0.3)] transition hover:bg-[#6A48D6] sm:w-auto"
              >
                Đăng nhập để mở khóa
              </Link>
              <p className="mt-3.5 inline-flex max-w-[34em] flex-wrap items-center gap-x-1 text-[13px] font-semibold leading-[1.55] text-[var(--text-muted)]">
                Đây là đề trả phí — đăng nhập rồi mua bộ đề bằng <FishBone /> xương cá để mở khóa.
              </p>
            </>
          ) : (
            /* locked_auth — đã đăng nhập, chưa mở khóa: CTA mua bundle chứa đề (checkout coin W16 live).
               product null → fallback /products. Logic FE-F01 giữ nguyên. */
            <>
              <Link
                href={meta.product ? `/products/${meta.product.slug}` : '/products'}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#7C5CE6] px-[26px] py-[15px] text-[15.5px] font-bold text-white shadow-[0_12px_28px_rgba(124,92,230,0.3)] transition hover:bg-[#6A48D6] sm:w-auto"
              >
                {meta.product ? `Mua bộ đề "${meta.product.title}" →` : 'Xem bộ đề chứa đề này →'}
              </Link>
              <p className="mt-3.5 max-w-[34em] text-[13px] font-semibold leading-[1.55] text-[var(--text-muted)]">
                <span className="inline-flex flex-wrap items-center gap-x-1">
                  Đề trả phí — mua bộ đề bằng <FishBone /> xương cá, mở khóa ngay sau khi thanh toán.
                </span>{' '}
                <Link href="/products" className="font-bold text-[#6A48D6] hover:underline">
                  Xem tất cả bộ đề →
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
