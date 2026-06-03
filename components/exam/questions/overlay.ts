import type { CSSProperties } from 'react'

// W7 — Overlay positioning cho input nhãn trên ảnh diagram/map.
// FIX (Leader review P2): input gần mép ảnh KHÔNG bị cắt (container overflow-hidden).
//   Transform theo BIÊN: gần trái → neo mép trái (translateX 0); gần phải → neo mép phải (-100%);
//   giữa → căn giữa (-50%). Tương tự trục dọc. → input luôn nằm trong khung.
const clampPct = (n: number | undefined): number =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 50

const EDGE = 15 // ngưỡng % coi là "gần biên"

function axisTranslate(pct: number): string {
  if (pct <= EDGE) return '0%' // neo mép (điểm = cạnh bắt đầu của input)
  if (pct >= 100 - EDGE) return '-100%' // neo mép đối diện
  return '-50%' // căn giữa
}

// Trả style tuyệt đối cho input overlay: vị trí theo % + transform biên-aware.
export function overlayStyle(x: number | undefined, y: number | undefined): CSSProperties {
  const px = clampPct(x)
  const py = clampPct(y)
  return {
    left: `${px}%`,
    top: `${py}%`,
    transform: `translate(${axisTranslate(px)}, ${axisTranslate(py)})`,
  }
}
