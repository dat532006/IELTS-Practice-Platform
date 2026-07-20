'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

type Props = Omit<ComponentProps<typeof Link>, 'href' | 'className'> & {
  href: string
  className?: string
  activeClassName?: string
  inactiveClassName?: string
  match?: 'exact' | 'prefix'
}

function isCurrent(href: string, pathname: string, searchParams: URLSearchParams, match: 'exact' | 'prefix') {
  const [targetPath, targetQuery = ''] = href.split('?')
  if (targetQuery) {
    if (pathname !== targetPath) return false
    const expected = new URLSearchParams(targetQuery)
    return [...expected].every(([key, value]) => searchParams.get(key) === value)
  }
  return match === 'exact' ? pathname === targetPath : pathname === targetPath || pathname.startsWith(`${targetPath}/`)
}

export function RouteNavLink({
  href,
  className,
  activeClassName,
  inactiveClassName,
  match = 'prefix',
  ...props
}: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = isCurrent(href, pathname, searchParams, match)

  return (
    <Link
      {...props}
      href={href}
      aria-current={current ? 'page' : undefined}
      className={cn(className, current ? activeClassName : inactiveClassName)}
    />
  )
}
