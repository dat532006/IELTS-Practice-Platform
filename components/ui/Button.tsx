import Link from 'next/link'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'outline' | 'ghost'

const base =
  'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50'

const variants: Record<Variant, string> = {
  primary: 'bg-teal-700 text-white hover:bg-teal-800',
  outline: 'border border-slate-300 text-slate-800 hover:bg-slate-50',
  ghost: 'text-slate-700 hover:bg-slate-100',
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={cn(base, variants[variant], className)} {...props} />
}

export function ButtonLink({
  variant = 'primary',
  className,
  ...props
}: React.ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cn(base, variants[variant], className)} {...props} />
}
