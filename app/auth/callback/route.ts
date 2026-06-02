import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeNextPath } from '@/lib/utils'

// OAuth / email-confirm callback: đổi code lấy session rồi redirect.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNextPath(searchParams.get('next')) // chống open-redirect

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }
  return NextResponse.redirect(`${origin}/login?error=auth_callback`)
}
