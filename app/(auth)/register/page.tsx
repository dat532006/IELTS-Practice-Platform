import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { RegisterForm } from '@/components/auth/RegisterForm'

// Bug 2026-07-13: user ĐÃ đăng nhập vào /register (CTA cũ, bookmark, link ngoài) vẫn thấy form
//   đăng ký → về /dashboard. Guard server-side — mọi lối vào đều được chặn, không chỉ CTA landing.
export default async function RegisterPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')
  return <RegisterForm />
}
