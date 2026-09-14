import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Refresh Supabase session ở mỗi request (đặt trong root middleware.ts).
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Bắt buộc gọi getUser() để refresh token; không dùng getSession() ở server.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // UI-09: /dashboard/* là trang client gọi API sau mount → khách thấy khung dashboard rỗng + link /login
  //   không có next. Chuyển hướng server-side trước khi render, giữ nguyên đích (path + query) trong next.
  //   Chỉ là UX: API vẫn tự 401 (RLS/guard không đổi). `next` là path của chính request (luôn bắt đầu
  //   /dashboard) và /login còn sanitize lại qua safeNextPath.
  if (!user && requiresLogin(request.nextUrl.pathname)) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = ''
    loginUrl.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)
    const redirect = NextResponse.redirect(loginUrl)
    // Giữ cookie Supabase vừa set/xoá (vd phiên hết hạn bị dọn) trên response chuyển hướng.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }
  return response
}

const LOGIN_REQUIRED_PREFIXES = ['/dashboard']
function requiresLogin(pathname: string): boolean {
  return LOGIN_REQUIRED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}
