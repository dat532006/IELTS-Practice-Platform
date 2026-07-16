import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { canonicalRedirectTarget, strayAuthCodeRescue } from '@/lib/http/canonical-host'

// Refresh Supabase session mỗi request. (Admin route guard server-side: lib/auth/guards.ts)
// AUTH-007 (2026-07-17): trước khi refresh —
//   1) production mà request tới host lạ (vd *.vercel.app) → 308 về NEXT_PUBLIC_SITE_URL. App chỉ còn
//      MỘT origin: cookie session/PKCE hết tách đôi giữa vercel.app và domain chính (bug "login xong
//      văng về vercel.app và vẫn Log in"). /api/* và preview/dev KHÔNG bị đụng (webhook/cron không
//      chắc follow redirect; preview phải test được trên host riêng).
//   2) mã OAuth đáp nhầm '/' (Site-URL fallback khi allowlist Supabase drift) → chuyển tới
//      /auth/callback để đổi code thành session thay vì chết câm trên trang chủ.
// THỨ TỰ SỐNG CÒN: (1) trước (2) — PKCE verifier cookie nằm ở canonical host, exchange trên host lạ
//   là FAIL; cả hai trước updateSession (response redirect không cần refresh session).
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  const canonical = canonicalRedirectTarget({
    host: request.headers.get('host'),
    pathname,
    search,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    vercelEnv: process.env.VERCEL_ENV,
  })
  if (canonical) return NextResponse.redirect(canonical, 308)

  const rescue = strayAuthCodeRescue(pathname, search)
  if (rescue) return NextResponse.redirect(new URL(rescue, request.url))

  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
