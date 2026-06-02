import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Refresh Supabase session mỗi request. (Admin route guard server-side: lib/auth/guards.ts)
export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
