'use client'

import { useState } from 'react'
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
  'flex items-center gap-2.5 rounded-[12px] border border-[#E8E2F0] bg-white px-3.5 shadow-[0_4px_12px_rgba(42,39,64,0.04)] focus-within:border-[#7C5CE6]'
const INPUT =
  'min-w-0 flex-1 border-none bg-transparent py-[13px] text-[14.5px] text-[#2A2740] outline-none placeholder:text-[#B9B0C8]'

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="mb-[7px] block text-[13px] font-bold text-[#4A445E]">{children}</span>
}

type FieldProps = {
  label?: ReactNode
  icon: ReactNode
  labelRow?: ReactNode
} & InputHTMLAttributes<HTMLInputElement>

// Text/email field (icon dẫn bên trái).
export function AuthField({ label, icon, labelRow, className, ...input }: FieldProps) {
  return (
    <div className={className}>
      {labelRow ?? (label && <FieldLabel>{label}</FieldLabel>)}
      <div className={ROW}>
        <span className="flex flex-none text-[#B9B0C8]">{icon}</span>
        <input className={INPUT} {...input} />
      </div>
    </div>
  )
}

type PasswordProps = {
  label?: ReactNode
  labelRow?: ReactNode
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
  return (
    <div className={className}>
      {labelRow ?? (label && <FieldLabel>{label}</FieldLabel>)}
      <div className={ROW}>
        <span className="flex flex-none text-[#B9B0C8]">{icon}</span>
        <input
          type={show ? 'text' : 'password'}
          className={INPUT}
          style={show ? undefined : { letterSpacing: '2px' }}
          {...input}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          className="flex flex-none text-[#B9B0C8] transition hover:text-[#7C5CE6]"
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
