'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { FishBone } from '@/components/brand/FishBone'

// Admin hồ sơ người dùng (M11 mở rộng, 2026-07-12). Client gọi API; guard THẬT ở server.
//   Gồm: profile + ban, ví (chỉnh coin qua RPC ledger — LUÔN có lý do), VOL sở hữu (via),
//   lịch sử giao dịch, lịch sử làm bài (band/điểm) + Writing AI bands.
type Detail = {
  profile: {
    id: string
    email: string | null
    name: string | null
    coins: number
    role: string
    plan: string
    created_at: string
    banned: boolean
    banned_until: string | null
  }
  unlocks: { product_id: string; via: string; created_at: string; title: string | null; slug: string | null }[]
  transactions: {
    id: string
    type: string
    status: string
    amount_coins: number
    amount_vnd: number | null
    provider: string | null
    note: string | null
    created_at: string
  }[]
  attempts: {
    id: string
    test_id: string
    status: string
    raw_score: number | null
    band: number | null
    time_spent: number | null
    started_at: string
    submitted_at: string | null
    test_title: string | null
    test_type: string | null
  }[]
  writing: {
    attempt_id: string
    graded_at: string | null
    task1_band: number | null
    task2_band: number | null
    overall_band: number | null
    task1_wc: number | null
    task2_wc: number | null
    est_cost_usd: number | null // AI-016: chi phí AI/lượt (bài cũ → null)
  }[]
  counts: { unlocks: number; transactions: number; attempts: number; writing: number }
  limits: { unlocks: number; transactions: number; attempts: number; writing: number }
}

// ADMIN-004 — nhãn TRUNG THỰC: nếu tổng thật > số đang hiển thị (đã cap) → "N gần nhất / M tổng";
//   ngược lại chỉ hiện tổng. Không bao giờ trình bày độ dài mảng đã cap NHƯ LÀ tổng.
const countLabel = (shown: number, total: number): string =>
  total > shown ? `${shown} gần nhất / ${total} tổng` : `${total}`

const inputCls =
  'rounded-[11px] border border-[#E4DEEE] bg-white px-3.5 py-2.5 text-sm text-[#2A2740] focus:border-[#7C5CE6] focus:outline-none'
const cardCls = 'rounded-[16px] border border-[#ECE7F4] bg-white p-5'
const secTitleCls = 'text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-[#6A6480]'

const TXN_LABEL: Record<string, string> = {
  topup: 'Nạp xương cá',
  spend: 'Mở khóa gói đề',
  bonus: 'Admin cộng',
  adjust: 'Admin trừ',
  refund: 'Hoàn lại',
}
const VIA_LABEL: Record<string, string> = { purchase: 'Mua bằng xương cá', redeem: 'Mã kích hoạt', admin: 'Admin cấp' }
const ATTEMPT_LABEL: Record<string, string> = { in_progress: 'Đang làm', submitted: 'Đã nộp', expired: 'Hết giờ' }

function fmtDateTime(s: string | null) {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleString('vi-VN', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return s
  }
}
function fmtDur(sec: number | null) {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60)
  return `${m}p${String(Math.floor(sec % 60)).padStart(2, '0')}`
}

export function AdminUserDetail({ userId }: { userId: string }) {
  const [d, setD] = useState<Detail | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [notFound, setNotFound] = useState(false)

  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const [coinBusy, setCoinBusy] = useState(false)
  const [coinMsg, setCoinMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const [banBusy, setBanBusy] = useState(false)
  const [banConfirm, setBanConfirm] = useState(false)
  const [banErr, setBanErr] = useState('')

  const load = useCallback(async () => {
    setLoadErr('')
    try {
      const r = await fetch(`/api/admin/users/${userId}`)
      const j = await r.json().catch(() => null)
      if (r.ok && j?.data?.profile) setD(j.data as Detail)
      else if (r.status === 404) setNotFound(true)
      else if (r.status === 403) setLoadErr('Bạn không có quyền admin.')
      else setLoadErr('Không tải được hồ sơ.')
    } catch {
      setLoadErr('Lỗi kết nối.')
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  async function adjustCoins(sign: 1 | -1) {
    const n = Math.abs(Number(delta))
    setCoinMsg(null)
    if (!Number.isInteger(n) || n <= 0) return setCoinMsg({ tone: 'err', text: 'Nhập số xương cá nguyên dương.' })
    if (reason.trim().length < 3) return setCoinMsg({ tone: 'err', text: 'Nhập lý do (tối thiểu 3 ký tự) — sẽ ghi vào lịch sử giao dịch.' })
    setCoinBusy(true)
    try {
      const r = await fetch(`/api/admin/users/${userId}/coins`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ delta: sign * n, reason: reason.trim() }),
      })
      const j = await r.json().catch(() => null)
      if (r.ok && j?.data) {
        setCoinMsg({ tone: 'ok', text: `✓ Đã ${sign > 0 ? 'cộng' : 'trừ'} ${n} xương cá. Số dư mới: ${j.data.coins}.` })
        setDelta('')
        setReason('')
        await load()
      } else if (j?.meta?.error_code === 'INSUFFICIENT_COINS') {
        setCoinMsg({ tone: 'err', text: 'Số dư không đủ để trừ mức này.' })
      } else setCoinMsg({ tone: 'err', text: (j?.message as string) || 'Không chỉnh được xương cá.' })
    } catch {
      setCoinMsg({ tone: 'err', text: 'Lỗi kết nối.' })
    } finally {
      setCoinBusy(false)
    }
  }

  async function toggleBan() {
    if (!d) return
    setBanBusy(true)
    setBanErr('')
    setBanConfirm(false)
    try {
      const r = await fetch(`/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ banned: !d.profile.banned }),
      })
      const j = await r.json().catch(() => null)
      if (r.ok) await load()
      else setBanErr((j?.message as string) || 'Không cập nhật được trạng thái khóa.')
    } catch {
      setBanErr('Lỗi kết nối.')
    } finally {
      setBanBusy(false)
    }
  }

  const backLink = (
    <Link href="/admin/users" className="text-sm font-semibold text-[#6A48D6] underline">
      ← Danh sách người dùng
    </Link>
  )

  if (notFound)
    return (
      <div>
        {backLink}
        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">Không tìm thấy tài khoản.</p>
      </div>
    )
  if (loadErr)
    return (
      <div>
        {backLink}
        <p className="mt-6 rounded-[10px] border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{loadErr}</p>
      </div>
    )
  if (!d)
    return (
      <div>
        {backLink}
        <p className="mt-6 text-center text-sm text-[var(--text-subtle)]">Đang tải…</p>
      </div>
    )

  const p = d.profile
  const writingByAttempt = new Map(d.writing.map((w) => [w.attempt_id, w]))

  return (
    <div className="rounded-[20px] border border-[#E7E4EE] bg-white p-6 text-[#2A2740] shadow-[0_30px_60px_-38px_rgba(60,40,90,0.4)] sm:p-8">
      <div className="mb-1">{backLink}</div>

      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[21px] font-extrabold tracking-[-0.02em]">{p.email ?? '(không có email)'}</h1>
        <span className={`rounded-full px-2.5 py-1 text-[12px] font-extrabold ${p.role === 'admin' ? 'bg-[#F0ECFF] text-[#5B43C7]' : 'bg-[#EFEBF2] text-[#8B8398]'}`}>
          {p.role}
        </span>
        {p.banned && <span className="rounded-full bg-[#FDECEC] px-2.5 py-1 text-[12px] font-extrabold text-[#C0392B]">Đã khóa</span>}
      </div>
      <p className="mt-1 text-[13px] font-semibold text-[var(--text-muted)]">
        {p.name ? `${p.name} · ` : ''}Đăng ký {fmtDateTime(p.created_at)} · <span className="font-mono text-[11.5px]">{p.id}</span>
      </p>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[22rem_1fr]">
        {/* left column: wallet + ban */}
        <div className="flex flex-col gap-4">
          <div className={cardCls}>
            <div className={secTitleCls}>Ví xương cá</div>
            <div className="mt-2 flex items-center gap-2 text-[26px] font-extrabold">
              {p.coins} <FishBone />
            </div>
            <div className="mt-3 border-t border-[#F0EDF6] pt-3">
              <label className="block text-[12px] font-extrabold text-[#6A6480]">
                Số xương cá
                <input className={`${inputCls} mt-1 w-full`} type="number" min={1} value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="VD: 60" />
              </label>
              <label className="mt-2 block text-[12px] font-extrabold text-[#6A6480]">
                Lý do (bắt buộc — ghi vào lịch sử giao dịch)
                <input className={`${inputCls} mt-1 w-full`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: đền bù lỗi thanh toán" />
              </label>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => adjustCoins(1)}
                  disabled={coinBusy}
                  className="flex-1 rounded-[10px] bg-[#1E9E63] px-3 py-2.5 text-[13px] font-bold text-white transition hover:bg-[#187F50] disabled:opacity-50"
                >
                  + Cộng
                </button>
                <button
                  type="button"
                  onClick={() => adjustCoins(-1)}
                  disabled={coinBusy}
                  className="flex-1 rounded-[10px] bg-[#C0392B] px-3 py-2.5 text-[13px] font-bold text-white transition hover:bg-[#A33224] disabled:opacity-50"
                >
                  − Trừ
                </button>
              </div>
              {coinMsg && (
                <p aria-live="polite" className={`mt-2 text-[12.5px] font-bold ${coinMsg.tone === 'ok' ? 'text-[var(--text-success)]' : 'text-[#D24A4A]'}`}>
                  {coinMsg.text}
                </p>
              )}
              <p className="mt-2 text-[11px] leading-[1.5] text-[var(--text-subtle)]">
                Mọi lần chỉnh đều ghi giao dịch (cộng = “Admin cộng”, trừ = “Admin trừ”) kèm lý do — người dùng thấy được trong ví của họ.
              </p>
            </div>
          </div>

          <div className={cardCls}>
            <div className={secTitleCls}>Trạng thái tài khoản</div>
            <p className="mt-2 text-[13px] font-semibold text-[#564F6B]">
              {p.banned ? 'Tài khoản đang bị KHÓA — không đăng nhập được.' : 'Tài khoản hoạt động bình thường.'}
            </p>
            {banErr && <p className="mt-2 rounded-[10px] border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{banErr}</p>}
            {banConfirm ? (
              <div className="mt-3 flex items-center gap-2 text-[13px] font-bold">
                {p.banned ? 'Mở khóa tài khoản này?' : 'Khóa tài khoản này?'}
                <button type="button" onClick={toggleBan} disabled={banBusy} className="text-[#C0392B] underline">
                  Xác nhận
                </button>
                <button type="button" onClick={() => setBanConfirm(false)} className="underline">
                  Hủy
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setBanConfirm(true)}
                disabled={banBusy}
                className={`mt-3 w-full rounded-[10px] px-3 py-2.5 text-[13px] font-bold transition disabled:opacity-50 ${
                  p.banned ? 'bg-[#E7F7EE] text-[#1E7A48] hover:bg-[#D4F0E1]' : 'bg-[#FDECEC] text-[#C0392B] hover:bg-[#FBDCDC]'
                }`}
              >
                {p.banned ? 'Mở khóa tài khoản' : 'Khóa tài khoản'}
              </button>
            )}
            <p className="mt-2 text-[11px] leading-[1.5] text-[var(--text-subtle)]">
              Khóa chặn đăng nhập/làm mới phiên. Phiên đang mở còn hiệu lực tối đa ~1 giờ trước khi bị chặn hẳn.
            </p>
          </div>
        </div>

        {/* right column: unlocks + transactions + attempts */}
        <div className="flex flex-col gap-4">
          <div className={cardCls}>
            <div className={secTitleCls}>Gói đề sở hữu ({countLabel(d.unlocks.length, d.counts.unlocks)})</div>
            {d.unlocks.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--text-subtle)]">Chưa sở hữu gói nào.</p>
            ) : (
              <div className="mt-2 flex flex-col gap-1.5">
                {d.unlocks.map((u) => (
                  <div key={u.product_id} className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[#F0EDF6] px-3 py-2 text-[13px]">
                    <span className="font-bold">{u.title ?? u.slug ?? u.product_id.slice(0, 8)}</span>
                    <span className="rounded-full bg-[#F4F1FB] px-2 py-0.5 text-[11px] font-extrabold text-[#6A48D6]">{VIA_LABEL[u.via] ?? u.via}</span>
                    <span className="ml-auto text-[11.5px] text-[var(--text-subtle)]">{fmtDateTime(u.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={cardCls}>
            <div className={secTitleCls}>Lịch sử giao dịch ({countLabel(d.transactions.length, d.counts.transactions)})</div>
            {d.transactions.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--text-subtle)]">Chưa có giao dịch nào.</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-left text-[12.5px]">
                  <thead>
                    <tr className="border-b border-[#ECE9F2] text-[11px] font-extrabold uppercase tracking-[0.04em] text-[#9088A2]">
                      <th className="px-2 py-2">Loại</th>
                      <th className="px-2 py-2 text-right">Xương cá</th>
                      <th className="px-2 py-2 text-right">VND</th>
                      <th className="px-2 py-2 text-center">Trạng thái</th>
                      <th className="px-2 py-2">Ghi chú</th>
                      <th className="px-2 py-2">Thời gian</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.transactions.map((t) => {
                      const credit = t.type !== 'spend' && t.type !== 'adjust'
                      return (
                        <tr key={t.id} className="border-b border-[#F3F1F8]">
                          <td className="px-2 py-2 font-bold">{TXN_LABEL[t.type] ?? t.type}{t.provider ? ` · ${t.provider}` : ''}</td>
                          <td className={`px-2 py-2 text-right font-mono font-bold ${credit ? 'text-[var(--text-success)]' : 'text-[#C0392B]'}`}>
                            {credit ? '+' : '−'}
                            {t.amount_coins}
                          </td>
                          <td className="px-2 py-2 text-right font-mono">{t.amount_vnd != null ? t.amount_vnd.toLocaleString('vi-VN') : '—'}</td>
                          <td className="px-2 py-2 text-center">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10.5px] font-extrabold ${
                                t.status === 'success'
                                  ? 'bg-[#E7F7EE] text-[var(--text-success)]'
                                  : t.status === 'pending'
                                    ? 'bg-[#FFF1DC] text-[#C98A1A]'
                                    : 'bg-[#EFEBF2] text-[#8B8398]'
                              }`}
                            >
                              {t.status}
                            </span>
                          </td>
                          <td className="max-w-[180px] truncate px-2 py-2 text-[var(--text-muted)]" title={t.note ?? ''}>
                            {t.note ?? '—'}
                          </td>
                          <td className="px-2 py-2 text-[var(--text-muted)]">{fmtDateTime(t.created_at)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className={cardCls}>
            <div className={secTitleCls}>Lịch sử làm bài ({countLabel(d.attempts.length, d.counts.attempts)})</div>
            {d.attempts.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--text-subtle)]">Chưa làm đề nào.</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[620px] border-collapse text-left text-[12.5px]">
                  <thead>
                    <tr className="border-b border-[#ECE9F2] text-[11px] font-extrabold uppercase tracking-[0.04em] text-[#9088A2]">
                      <th className="px-2 py-2">Đề</th>
                      <th className="px-2 py-2 text-center">Kỹ năng</th>
                      <th className="px-2 py-2 text-center">Trạng thái</th>
                      <th className="px-2 py-2 text-center">Điểm</th>
                      <th className="px-2 py-2 text-center">Band</th>
                      <th className="px-2 py-2 text-center">Thời gian làm</th>
                      <th className="px-2 py-2">Nộp lúc</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.attempts.map((a) => {
                      const w = writingByAttempt.get(a.id)
                      return (
                        <tr key={a.id} className="border-b border-[#F3F1F8]">
                          <td className="max-w-[220px] truncate px-2 py-2 font-bold" title={a.test_title ?? a.test_id}>
                            {a.test_title ?? a.test_id.slice(0, 8)}
                          </td>
                          <td className="px-2 py-2 text-center">{a.test_type ?? '—'}</td>
                          <td className="px-2 py-2 text-center">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10.5px] font-extrabold ${
                                a.status === 'submitted'
                                  ? 'bg-[#E7F7EE] text-[var(--text-success)]'
                                  : a.status === 'in_progress'
                                    ? 'bg-[#FFF1DC] text-[#C98A1A]'
                                    : 'bg-[#EFEBF2] text-[#8B8398]'
                              }`}
                            >
                              {ATTEMPT_LABEL[a.status] ?? a.status}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-center font-mono font-bold">{a.raw_score != null ? a.raw_score : '—'}</td>
                          <td className="px-2 py-2 text-center font-mono font-bold text-[#6A48D6]">
                            {w
                              ? `${w.overall_band ?? a.band ?? '—'}${w.task1_band != null || w.task2_band != null ? ` (T1 ${w.task1_band ?? '—'} · T2 ${w.task2_band ?? '—'})` : ''}${w.est_cost_usd != null ? ` · $${w.est_cost_usd.toFixed(4)}` : ''}`
                              : a.band != null
                                ? a.band
                                : '—'}
                          </td>
                          <td className="px-2 py-2 text-center">{fmtDur(a.time_spent)}</td>
                          <td className="px-2 py-2 text-[var(--text-muted)]">{fmtDateTime(a.submitted_at)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
