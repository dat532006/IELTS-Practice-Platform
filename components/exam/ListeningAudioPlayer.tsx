'use client'

import { useEffect, useRef, useState } from 'react'

// ============================================================
// W7 — Listening audio player (M03/M05).
// Dùng `audio_url` SIGNED từ GET /api/exam/[id] (đã guard server). KHÔNG hardcode public URL,
//   KHÔNG hiển thị raw object key (BE không trả audio_key).
// Custom controls (KHÔNG native <audio controls>): play-once BEST-EFFORT (mô phỏng thi thật):
//   - chỉ phát 1 lần/phiên: idle → playing → ended (không nút replay)
//   - không scrubber seekable (không cho tua); chống tua lùi best-effort
//   - controlsList nodownload (phụ trợ; KHÔNG phải bảo mật tuyệt đối)
// ⚠️ Đây là UX best-effort — KHÔNG chống ghi âm/devtools/seek tuyệt đối (xem report).
// audio_url == null → panel disabled "Audio chưa sẵn sàng" (KHÔNG crash; reading/thiếu R2 env).
// ============================================================

// FIX (Leader review P2): +'error' — lỗi load/network/expired URL KHÔNG map sang 'paused'.
type PlayState = 'idle' | 'playing' | 'paused' | 'ended' | 'error'

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function ListeningAudioPlayer({ audioUrl }: { audioUrl: string | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const maxTimeRef = useRef(0) // mốc thời gian xa nhất đã nghe (chống tua lùi best-effort)
  const [state, setState] = useState<PlayState>('idle')
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [muted, setMuted] = useState(false)

  // Reset khi đổi nguồn audio.
  useEffect(() => {
    maxTimeRef.current = 0
    setState('idle')
    setCurrent(0)
    setDuration(0)
  }, [audioUrl])

  if (!audioUrl) {
    return (
      <div
        data-testid="listening-audio"
        className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
      >
        🎧 Audio chưa sẵn sàng cho đề nghe này. Bạn vẫn có thể trả lời câu hỏi; vui lòng thử tải lại sau.
      </div>
    )
  }

  const play = () => {
    const el = audioRef.current
    if (!el || state === 'ended' || state === 'error') return
    // Lỗi media (el.error: load/network/expired) → 'error'; reject do autoplay-policy (không có el.error) → 'paused' (cho retry).
    void el.play().then(() => setState('playing')).catch(() => setState(el.error ? 'error' : 'paused'))
  }
  const pause = () => {
    audioRef.current?.pause()
    setState('paused')
  }

  return (
    <div data-testid="listening-audio" className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="none"
        controlsList="nodownload noplaybackrate noremoteplayback"
        onContextMenu={(e) => e.preventDefault()}
        onError={() => setState('error')}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime
          // chống tua lùi best-effort: nếu nhảy lùi quá mốc đã nghe → kéo lại
          if (t + 1.5 < maxTimeRef.current) {
            e.currentTarget.currentTime = maxTimeRef.current
            return
          }
          maxTimeRef.current = Math.max(maxTimeRef.current, t)
          setCurrent(t)
        }}
        onEnded={() => {
          setState('ended')
          setCurrent(duration)
        }}
      />

      {state === 'error' ? (
        <div className="flex flex-wrap items-center gap-3 text-sm text-red-700">
          <span aria-hidden>⚠️</span>
          <span>Không phát được audio (có thể đã hết hạn hoặc lỗi mạng).</span>
          <button
            onClick={() => location.reload()}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Tải lại để lấy liên kết mới
          </button>
        </div>
      ) : (
        <>
      <div className="flex items-center gap-3">
        <span className="text-lg" aria-hidden>🎧</span>
        {state === 'idle' ? (
          <button
            onClick={play}
            className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
          >
            ▶ Phát audio
          </button>
        ) : state === 'ended' ? (
          <button disabled className="cursor-not-allowed rounded-md bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-500">
            Đã phát xong
          </button>
        ) : (
          <button
            onClick={state === 'playing' ? pause : play}
            className="rounded-md border border-teal-700 px-3 py-1.5 text-sm font-medium text-teal-700 hover:bg-teal-50"
          >
            {state === 'playing' ? '⏸ Tạm dừng' : '▶ Tiếp tục'}
          </button>
        )}

        {/* progress READ-ONLY (KHÔNG seekable) */}
        <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-200" aria-hidden>
          <div
            className="h-full bg-teal-600 transition-[width]"
            style={{ width: duration > 0 ? `${Math.min(100, (current / duration) * 100)}%` : '0%' }}
          />
        </div>
        <span className="tabular-nums text-xs text-slate-500">
          {fmt(current)} / {fmt(duration)}
        </span>

        <button
          onClick={() => {
            const el = audioRef.current
            if (!el) return
            el.muted = !el.muted
            setMuted(el.muted)
          }}
          className="text-xs text-slate-500 underline"
        >
          {muted ? 'Bật tiếng' : 'Tắt tiếng'}
        </button>
      </div>

      <p className="mt-1.5 text-[11px] text-slate-400">
        Audio phát một lần (mô phỏng thi thật). Có thể tạm dừng/tiếp tục, không tua lại, không phát lại sau khi hết — best effort, không phải bảo mật tuyệt đối.
      </p>
        </>
      )}
    </div>
  )
}
