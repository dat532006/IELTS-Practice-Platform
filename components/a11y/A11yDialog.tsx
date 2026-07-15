'use client'

import { useEffect, useRef } from 'react'
import type { HTMLAttributes } from 'react'

// ============================================================
// UI-003 — Dialog primitive có ĐẦY ĐỦ ngữ nghĩa bàn phím. Modal tùy biến trước đây chỉ có role/aria-modal
//   nhưng THIẾU: focus vào dialog khi mở, TRAP Tab trong dialog, Escape để đóng, TRẢ focus về phần tử cũ
//   khi đóng. Vì dialog render có điều kiện (mount/unmount theo state open), hook chạy trong CHÍNH component
//   này nên effect open/close khớp vòng đời render. onClose nên ổn định (không bắt buộc — dùng ref nội bộ).
// ============================================================

const FOCUSABLE =
  'a[href],area[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function useDialogKeyboard<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const prevActive = document.activeElement as HTMLElement | null

    const focusables = () => Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
    const first = focusables()[0]
    if (first) first.focus()
    else {
      node.tabIndex = -1
      node.focus()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === firstEl || !node.contains(active))) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && (active === lastEl || !node.contains(active))) {
        e.preventDefault()
        firstEl.focus()
      }
    }

    node.addEventListener('keydown', onKeyDown)
    return () => {
      node.removeEventListener('keydown', onKeyDown)
      // Trả focus về nơi mở dialog (nếu còn trong DOM) — tránh mất focus về <body>.
      if (prevActive && document.contains(prevActive) && typeof prevActive.focus === 'function') prevActive.focus()
    }
  }, [])

  return ref
}

type Props = {
  onClose: () => void
  /** id của tiêu đề trong dialog → aria-labelledby (ưu tiên). Nếu không có tiêu đề, dùng ariaLabel. */
  labelledBy?: string
  ariaLabel?: string
} & Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'aria-modal'>

// Container role="dialog" aria-modal có focus-trap/Escape/restore. Overlay (click-ra-ngoài) do caller bọc ngoài.
export function A11yDialog({ onClose, labelledBy, ariaLabel, children, ...rest }: Props) {
  const ref = useDialogKeyboard<HTMLDivElement>(onClose)
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : ariaLabel} {...rest}>
      {children}
    </div>
  )
}
