import { createClient } from '@/lib/supabase/server'
import { fail } from '@/lib/api/response'

// GET /api/vocab/export — xuất sổ từ vựng của CHÍNH user ra CSV (M09, W17).
//   Server client + RLS own-only → CSV chỉ chứa dữ liệu của user hiện tại, không lộ người khác.
//   Escape CSV đúng (bọc dấu ", nhân đôi " nội bộ) để chống chèn/gãy cột.
function csvCell(value: unknown): string {
  let s = value == null ? '' : String(value)
  // Chống CSV/formula injection: cell bắt đầu bằng = + - @ (hoặc tab/CR) có thể bị Excel/Sheets diễn giải
  //   thành CÔNG THỨC → prefix dấu nháy đơn để trung hoà (dữ liệu người dùng, tránh chạy lệnh khi mở file).
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('UNAUTHORIZED', 'Bạn cần đăng nhập', { status: 401 })

  const { data, error } = await supabase
    .from('vocab_log')
    .select('word, definition, example, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) return fail('INTERNAL', 'Không xuất được sổ từ vựng', { status: 500 })

  const header = ['word', 'definition', 'example', 'created_at']
  const rows = (data ?? []).map((r) => {
    const row = r as { word: string; definition: string | null; example: string | null; created_at: string }
    return [row.word, row.definition, row.example, row.created_at].map(csvCell).join(',')
  })
  // BOM để Excel mở UTF-8 (tiếng Việt) đúng.
  const csv = '﻿' + [header.join(','), ...rows].join('\r\n') + '\r\n'

  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="vocab.csv"',
    },
  })
}
