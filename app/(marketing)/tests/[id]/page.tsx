import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTestMeta } from '@/lib/exam/meta'
import {
  SKILL_LABEL,
  canEnterExam,
  deriveTestUiState,
  formatDurationMin,
} from '@/lib/products/access-state'
import { isUuid } from '@/lib/utils'

// W4 — Pre-exam page (M05). Server component đọc getTestMeta (SAFE metadata, KHÔNG payload).
// CTA theo access-state: free/unlocked → vào /exam/[id]; locked → login (guest) / mua (auth).
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <nav className="text-xs text-slate-400">
        <Link href="/" className="hover:text-teal-700">
          Trang chủ
        </Link>{' '}
        /{' '}
        <Link href="/products" className="hover:text-teal-700">
          Bộ đề
        </Link>{' '}
        / <span className="text-slate-600">{meta.title}</span>
      </nav>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{meta.title}</h1>
          {meta.is_free ? (
            <span className="shrink-0 rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
              Miễn phí
            </span>
          ) : meta.locked ? (
            <span className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              🔒 Khóa
            </span>
          ) : (
            <span className="shrink-0 rounded bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700">
              Đã mở
            </span>
          )}
        </div>

        {/* Metadata an toàn (không có nội dung đề) */}
        <dl className="mt-4 grid grid-cols-2 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-slate-400">Kỹ năng</dt>
            <dd className="font-medium text-slate-800">{SKILL_LABEL[meta.skill]}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Thời lượng</dt>
            <dd className="font-medium text-slate-800">{formatDurationMin(meta.duration_sec)}</dd>
          </div>
          {meta.difficulty != null && (
            <div>
              <dt className="text-slate-400">Độ khó</dt>
              <dd className="font-medium text-slate-800">{meta.difficulty}/5</dd>
            </div>
          )}
        </dl>

        {meta.question_types.length > 0 && (
          <div className="mt-4 text-sm">
            <p className="text-slate-400">Dạng câu hỏi</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {meta.question_types.map((qt) => (
                <span key={qt} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                  {qt}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* CTA theo access-state */}
        <div className="mt-6 border-t border-slate-100 pt-5">
          {canEnter ? (
            <>
              <Link
                href={`/exam/${meta.id}`}
                className="inline-flex w-full items-center justify-center rounded-md bg-teal-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-800 sm:w-auto"
              >
                {meta.is_free ? 'Bắt đầu làm bài →' : 'Vào làm bài →'}
              </Link>
              <p className="mt-2 text-xs text-slate-400">
                Trình làm bài (exam engine) sẽ mở ở W5.
              </p>
            </>
          ) : state === 'locked_guest' ? (
            <>
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center rounded-md bg-teal-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-800 sm:w-auto"
              >
                Đăng nhập để mở khóa
              </Link>
              <p className="mt-2 text-xs text-slate-400">
                Đây là đề trả phí — đăng nhập rồi mua bộ đề hoặc nhập mã kích hoạt.
              </p>
            </>
          ) : (
            /* locked_auth — đã đăng nhập nhưng chưa mở khóa: CTA Mua/Nhập mã placeholder (checkout M08/W15–16) */
            <>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled
                  title="Thanh toán mở ở giai đoạn sau (W15–16)"
                  className="inline-flex items-center justify-center rounded-md bg-teal-700 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Mua bộ đề
                </button>
                <button
                  type="button"
                  disabled
                  title="Nhập mã kích hoạt mở ở giai đoạn sau (W15–16)"
                  className="inline-flex items-center justify-center rounded-md border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Nhập mã
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Đề trả phí — mua bộ đề chứa đề này hoặc nhập mã kích hoạt (mở ở giai đoạn sau).{' '}
                <Link href="/products" className="text-teal-700 hover:underline">
                  Xem bộ đề
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
