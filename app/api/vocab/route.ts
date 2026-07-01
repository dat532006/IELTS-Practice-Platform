import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { ok, fail } from '@/lib/api/response'

// /api/vocab — sổ từ vựng cá nhân (M09, W17). OWN-ONLY qua RLS (vocab_log policy RW own + with check user_id=auth.uid()).
//   Server client (session user), KHÔNG service_role → không thể ghi/đọc dữ liệu người khác.
//   GET: list own. POST: thêm/cập nhật (upsert theo unique(user_id,word)). DELETE: xóa own theo id.

const UpsertSchema = z.object({
  word: z.string().trim().min(1).max(100),
  definition: z.string().trim().max(2000).optional().default(''),
  example: z.string().trim().max(2000).optional().default(''),
})
const DeleteSchema = z.object({ id: z.string().uuid() })

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('UNAUTHORIZED', 'Bạn cần đăng nhập', { status: 401 })

  const { data, error } = await supabase
    .from('vocab_log')
    .select('id, word, definition, example, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) return fail('INTERNAL', 'Không tải được sổ từ vựng', { status: 500 })
  return ok({ items: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('UNAUTHORIZED', 'Bạn cần đăng nhập', { status: 401 })

  const raw = await request.json().catch(() => null)
  const parsed = UpsertSchema.safeParse(raw)
  if (!parsed.success) return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ', { status: 400 })

  // Upsert theo unique(user_id, word): thêm mới hoặc cập nhật nghĩa/ví dụ của chính từ đó.
  const { data, error } = await supabase
    .from('vocab_log')
    .upsert(
      { user_id: user.id, word: parsed.data.word, definition: parsed.data.definition, example: parsed.data.example },
      { onConflict: 'user_id,word' },
    )
    .select('id, word, definition, example, created_at')
    .single()
  if (error) return fail('INTERNAL', 'Không lưu được từ vựng', { status: 500 })
  return ok({ item: data }, { status: 201 })
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('UNAUTHORIZED', 'Bạn cần đăng nhập', { status: 401 })

  const raw = await request.json().catch(() => null)
  const parsed = DeleteSchema.safeParse(raw)
  if (!parsed.success) return fail('VALIDATION_ERROR', 'Thiếu id từ vựng', { status: 400 })

  // RLS + eq(user_id) → chỉ xóa được từ của chính mình.
  const { error } = await supabase.from('vocab_log').delete().eq('user_id', user.id).eq('id', parsed.data.id)
  if (error) return fail('INTERNAL', 'Không xóa được từ vựng', { status: 500 })
  return ok({ id: parsed.data.id, deleted: true })
}
