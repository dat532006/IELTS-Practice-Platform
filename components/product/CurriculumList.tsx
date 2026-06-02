import Link from 'next/link'
import type { ProductDetailTest } from '@/types/catalog'
import {
  SKILL_LABEL,
  deriveTestUiState,
  formatDurationMin,
  type TestUiState,
} from '@/lib/products/access-state'

const STATE_BADGE: Record<TestUiState, { label: string; cls: string }> = {
  free: { label: 'Miễn phí', cls: 'bg-emerald-100 text-emerald-700' },
  unlocked: { label: 'Đã mở', cls: 'bg-teal-100 text-teal-700' },
  locked_guest: { label: '🔒 Khóa', cls: 'bg-amber-100 text-amber-700' },
  locked_auth: { label: '🔒 Khóa', cls: 'bg-amber-100 text-amber-700' },
}

// Mục lục bundle — đề sắp theo `position` (backend đã order). Mọi đề link tới pre-exam /tests/[id]
// (pre-exam tự enforce state; KHÔNG bao giờ link locked → /exam). `isAuthed` để chọn badge guest/auth.
export function CurriculumList({
  tests,
  isAuthed,
}: {
  tests: ProductDetailTest[]
  isAuthed: boolean
}) {
  if (tests.length === 0) {
    return <p className="text-sm text-slate-400">Bộ đề chưa có đề nào.</p>
  }
  return (
    <ol className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
      {tests.map((t, i) => {
        const state = deriveTestUiState(t, isAuthed)
        const badge = STATE_BADGE[state]
        return (
          <li key={t.id}>
            <Link
              href={`/tests/${t.id}`}
              className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50"
            >
              <span className="w-6 shrink-0 text-sm tabular-nums text-slate-400">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-900">{t.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {SKILL_LABEL[t.skill]} · {formatDurationMin(t.duration_sec)}
                </p>
              </div>
              <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                {badge.label}
              </span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
