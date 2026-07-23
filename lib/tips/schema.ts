import { z } from 'zod'

// Schema body cho /api/admin/tips (create) — dùng chung cho PATCH qua .partial().
// Tách khỏi route để tránh Next route-module chỉ cho export handler.
export const TipBody = z.object({
  slug: z
    .string()
    .trim()
    .min(1, 'Cần slug')
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'slug chỉ gồm chữ thường a-z, số và dấu gạch ngang'),
  skill: z.enum(['reading', 'listening', 'writing', 'speaking']),
  type: z.enum(['strategy', 'qtype']),
  title: z.string().trim().min(1, 'Cần tiêu đề').max(200),
  excerpt: z.string().trim().max(500).default(''),
  body_html: z.string().max(80000).default(''),
  author: z.string().trim().max(80).default(''),
  band: z.string().trim().max(40).default(''),
  read_minutes: z.coerce.number().int().min(1).max(120).default(5),
  status: z.enum(['draft', 'published']).default('draft'),
  sort_order: z.coerce.number().int().min(0).max(100000).default(0),
  featured: z.boolean().default(false),
})

// Xoá hàng loạt: nhận mảng id (đã chọn ở bảng admin). Chặn body rỗng / quá cỡ.
export const TipBulkDelete = z.object({
  ids: z.array(z.string().uuid('id không hợp lệ')).min(1, 'Chọn ít nhất 1 bài').max(1000),
})
