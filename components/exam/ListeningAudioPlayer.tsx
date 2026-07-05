'use client'

import { useEffect, useRef, useState } from 'react'
import { PlayIcon, PauseIcon, CheckIcon } from '@/components/exam/ExamIcons'

// ============================================================
// W7 — Listening audio player (M03/M05). dc-exam restyle: thanh gradient tím-than, nút play tròn,
//   equalizer + progress không seek + badge "Phát một lần · không thể tua".
// Dùng `audio_url` SIGNED từ GET /api/exam/[id] (đã guard server). KHÔNG hardcode public URL.
// Custom controls (KHÔNG native <audio controls>): play-once BEST-EFFORT (mô phỏng thi thật):
//   - idle → playing → ended (không nút replay); không scrubber; chống tua lùi best-effort.
// audio_url == null → panel disabled (KHÔNG crash).
// ============================================================

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

  useEffect(() => {
    maxTimeRef.current = 0
    setState('idle')
    setCurrent(0)
    setDuration(0)
  }, [audioUrl])

  if (!audioUrl) {
    return (
      <div data-testid="listening-audio" className="dcx-audio">
        <div className="dcx-audio-inner" style={{ color: '#ffd6a0', fontSize: 13.5, fontWeight: 600 }}>
          🎧 Audio chưa sẵn sàng cho đề nghe này. Bạn vẫn có thể trả lời câu hỏi; vui lòng thử tải lại sau.
        </div>
      </div>
    )
  }

  const play = () => {
    const el = audioRef.current
    if (!el || state === 'ended' || state === 'error' || state === 'playing') return
    void el.play().then(() => setState('playing')).catch(() => setState(el.error ? 'error' : 'paused'))
  }

  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0
  const btnClass =
    state === 'ended' ? 'done' : state === 'error' ? 'error' : state === 'playing' ? 'playing' : ''

  return (
    <div data-testid="listening-audio" className="dcx-audio">
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

      <div className="dcx-audio-inner">
        <button
          onClick={play}
          disabled={state === 'ended' || state === 'error' || state === 'playing'}
          className={`dcx-audio-play ${btnClass}`}
          aria-label={state === 'ended' ? 'Đã phát xong' : state === 'playing' ? 'Đang phát' : 'Phát audio'}
          title={state === 'ended' ? 'Đã phát xong' : state === 'playing' ? 'Đang phát (không thể tua)' : 'Phát audio (một lần)'}
        >
          {state === 'ended' ? (
            <CheckIcon className="h-5 w-5" />
          ) : state === 'playing' ? (
            <PauseIcon className="h-5 w-5" />
          ) : (
            <PlayIcon className="h-5 w-5" />
          )}
        </button>

        <div className="dcx-audio-body">
          <div className="dcx-audio-top">
            <span className="dcx-audio-label">
              {state === 'error' ? 'Không phát được audio' : 'Recording — Listening'}
            </span>
            <span className="dcx-audio-once">● Phát một lần · không thể tua</span>
          </div>
          <div className="dcx-audio-controls">
            <div className={`dcx-eq${state === 'playing' ? ' on' : ''}`} aria-hidden>
              <span style={{ height: '60%' }} />
              <span style={{ height: '100%' }} />
              <span style={{ height: '45%' }} />
              <span style={{ height: '80%' }} />
              <span style={{ height: '55%' }} />
            </div>
            <div className="dcx-audio-track" aria-hidden>
              <div className="dcx-audio-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="dcx-audio-time">
              {fmt(current)} / {fmt(duration)}
            </span>
            <button
              className="dcx-audio-mute"
              onClick={() => {
                const el = audioRef.current
                if (!el) return
                el.muted = !el.muted
                setMuted(el.muted)
              }}
            >
              {muted ? 'Bật tiếng' : 'Tắt tiếng'}
            </button>
          </div>
        </div>
      </div>

      {state === 'error' && (
        <div className="dcx-audio-inner" style={{ marginTop: 8, color: '#ffd6a0', fontSize: 12.5, gap: 10 }}>
          <span>Không phát được audio (có thể đã hết hạn hoặc lỗi mạng).</span>
          <button onClick={() => location.reload()} className="dcx-audio-mute">
            Tải lại để lấy liên kết mới
          </button>
        </div>
      )}
    </div>
  )
}
