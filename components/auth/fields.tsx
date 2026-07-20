'use client'

import { useId, useState } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { EyeIcon, EyeOffIcon } from '@/components/brand/icons'

// Shared building blocks cho auth forms — card trắng, field có icon dẫn, password + eye toggle.

export function AuthCard({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`w-full rounded-[22px] border border-[#EEEAF3] bg-white px-7 py-[30px] shadow-[0_30px_62px_-38px_rgba(90,60,160,0.5)] ${className}`}
    >
      {children}
    </div>
  )
}

const ROW =
  'auth-field-control flex items-center gap-2.5 rounded-[12px] border border-[#E8E2F0] bg-white px-3.5 shadow-[0_4px_12px_rgba(42,39,64,0.04)] focus-within:border-[#7C5CE6]'
const INPUT =
  'min-w-0 flex-1 border-none bg-transparent py-[13px] text-[14.5px] text-[#2A2740] outline-none placeholder:text-[var(--text-placeholder)]'

// UI-001: nhãn phải LIÊN KẾT chương trình với input. `htmlFor` set → render <label htmlFor> (screen reader
//   đọc đúng tên field); không set → <span> (trang trí, vd nhãn phụ). Style giữ nguyên.
export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  const cls = 'mb-[7px] block text-[13px] font-bold text-[#4A445E]'
  return htmlFor ? (
    <label htmlFor={htmlFor} className={cls}>
      {children}
    </label>
  ) : (
    <span className={cls}>{children}</span>
  )
}

// labelRow có thể là node tĩnh HOẶC hàm nhận id field (để caller gắn <FieldLabel htmlFor={id}> đúng input).
type LabelRow = ReactNode | ((id: string) => ReactNode)
const renderLabelRow = (labelRow: LabelRow, id: string): ReactNode =>
  typeof labelRow === 'function' ? labelRow(id) : labelRow

type FieldProps = {
  label?: ReactNode
  icon: ReactNode
  labelRow?: LabelRow
} & InputHTMLAttributes<HTMLInputElement>

// Text/email field (icon dẫn bên trái). UI-001: input luôn có id + nhãn liên kết (htmlFor).
export function AuthField({ label, icon, labelRow, className, ...input }: FieldProps) {
  const autoId = useId()
  const id = input.id ?? autoId
  return (
    <div className={className}>
      {labelRow != null ? renderLabelRow(labelRow, id) : label != null ? <FieldLabel htmlFor={id}>{label}</FieldLabel> : null}
      <div className={ROW}>
        <span className="flex flex-none text-[var(--text-placeholder)]">{icon}</span>
        <input className={INPUT} {...input} id={id} />
      </div>
    </div>
  )
}

type PasswordProps = {
  label?: ReactNode
  labelRow?: LabelRow
  icon: ReactNode
  rightAdornment?: ReactNode
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

// Password field với show/hide eye toggle. `rightAdornment` = node phụ (vd tick khớp mật khẩu).
export function PasswordField({
  label,
  labelRow,
  icon,
  rightAdornment,
  className,
  ...input
}: PasswordProps) {
  const [show, setShow] = useState(false)
  const autoId = useId()
  const id = input.id ?? autoId
  return (
    <div className={className}>
      {labelRow != null ? renderLabelRow(labelRow, id) : label != null ? <FieldLabel htmlFor={id}>{label}</FieldLabel> : null}
      <div className={ROW}>
        <span className="flex flex-none text-[var(--text-placeholder)]">{icon}</span>
        <input
          type={show ? 'text' : 'password'}
          className={INPUT}
          style={show ? undefined : { letterSpacing: '2px' }}
          {...input}
          id={id}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-[9px] text-[var(--text-placeholder)] transition-colors hover:text-[#5B43C7]"
        >
          {show ? <EyeOffIcon /> : <EyeIcon />}
        </button>
        {rightAdornment}
      </div>
    </div>
  )
}

// Nút submit chính (violet).
export function PrimaryButton({
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      className={`w-full rounded-[13px] bg-[#7C5CE6] p-[14px] text-[15px] font-bold text-white shadow-[0_14px_28px_-8px_rgba(124,92,230,0.55)] transition hover:bg-[#6A48D6] disabled:opacity-50 ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function AuthMessage({
  id,
  tone = 'error',
  children,
}: {
  id: string
  tone?: 'error' | 'success'
  children: ReactNode
}) {
  return (
    <p
      id={id}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={'mt-3.5 text-[13.5px] font-semibold ' + (tone === 'error' ? 'text-[var(--text-error)]' : 'text-[var(--text-success)]')}
    >
      {children}
    </p>
  )
}