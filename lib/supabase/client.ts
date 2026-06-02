import { createBrowserClient } from '@supabase/ssr'

// Browser client — chỉ dùng anon key (client-safe). KHÔNG bao giờ dùng service role ở đây.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
