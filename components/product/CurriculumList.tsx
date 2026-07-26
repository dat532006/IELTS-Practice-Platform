import Link from 'next/link'
import type { ProductDetailTest } from '@/types/catalog'
import {
  SKILL_LABEL,
  deriveTestUiState,
  formatDurationMin,
  type TestUiState,
} from '@/lib/products/access-state'
import { SkillTile, type SkillKey } from '@/components/brand/skill'
import { LockIcon } from '@/components/brand/icons'

const ROW = 'flex items-center gap-3.5 rounded-[14px] border border-[#EEEAF3] px-4 py-3.5'
const META = 'mt-0.5 text-[12.5px] font-semibold'

function StateChip({ state }: { state: TestUiState }) {
  if (state === 'free')
    return (
      <span className="rounded-full bg-[#E7F7EE] px-[11px] py-1.5 text-[12px] font-extrabold text-[var(--text-success)]">
        Miễn phí
      </span>
    )
  if (state === 'unlocked')
    return (
      <span className="rounded-full bg-[#E7F7EE] px-[11px] py-1.5 text-[12px] font-extrabold text-[var(--text-success)]">
        Đã mở
      </span>
    )
  return (
    <span className="rounded-full bg-[#F2EFF7] px-[11px] py-1.5 text-[12px] font-extrabold text-[var(--text-subtle)]">
      🔒 Khóa
    </span>
  )
}

// Ô 38×38 đầu mỗi dòng: có ảnh riêng của đề thì hiện ảnh (áp đúng khung Owner đã căn trong admin),
//   KHÔNG có thì rơi về ô icon theo kỹ năng như trước. Đề khóa vẫn dùng ổ khóa, không lộ ảnh.
function TestThumb({ t }: { t: ProductDetailTest }) {
  if (!t.cover_image) return <SkillTile skill={t.skill as SkillKey} tileSize={38} radius={11} glyphSize={20} />
  return (
    <span className="flex h-[38px] w-[38px] flex-none overflow-hidden rounded-[11px] border border-[#EEEAF3]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={t.cover_image}
        alt=""
        aria-hidden="true"
        loading="lazy"
        className="h-full w-full object-cover"
        style={{
          objectPosition: `${t.cover_pos_x}% ${t.cover_pos_y}%`,
          ...(t.cover_zoom !== 100 ? { transform: `scale(${t.cover_zoom / 100})` } : {}),
        }}
      />
    </span>
  )
}

// Mục lục bundle — đề sắp theo `position`. Đề mở (free/unlocked) link tới pre-exam /tests/[id];
// đề khóa = row mờ, KHÔNG click (đúng design: locked rows non-clickable & dimmed).
export function CurriculumList({
  tests,
  isAuthed,
}: {
  tests: ProductDetailTest[]
  isAuthed: boolean
}) {
  if (tests.length === 0) {
    return <p className="text-[14px] font-semibold text-[var(--text-subtle)]">Bộ đề chưa có đề nào.</p>
  }
  return (
    <div className="flex flex-col gap-2.5">
      {tests.map((t) => {
        const state = deriveTestUiState(t, isAuthed)
        const locked = state === 'locked_guest' || state === 'locked_auth'
        const meta = (
          <p className={`${META} ${locked ? 'text-[var(--text-subtle)]' : 'text-[var(--text-muted)]'}`}>
            {SKILL_LABEL[t.skill]} · {formatDurationMin(t.duration_sec)}
          </p>
        )

        if (locked) {
          return (
            <div key={t.id} className={`${ROW} bg-[#FBFAFD] opacity-[0.78]`}>
              <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] bg-[#EDE8F3] text-[var(--text-subtle)]">
                <LockIcon size={18} strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-extrabold text-[#564F6B]">{t.title}</p>
                {meta}
              </div>
              <StateChip state={state} />
            </div>
          )
        }

        return (
          <Link key={t.id} href={`/tests/${t.id}`} className={`${ROW} bg-white transition hover:bg-[#FBFAFF]`}>
            <TestThumb t={t} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-extrabold text-[#2A2740]">{t.title}</p>
              {meta}
            </div>
            <StateChip state={state} />
            <span className="text-[14px] font-bold text-[#6A48D6]">
              {state === 'unlocked' ? 'Vào →' : 'Làm →'}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
