// ============================================================
// DEPLOY-004 — Hợp đồng ENV tập trung, có kiểu + kiểm tra. Trước đây biến env rải rác đọc trực tiếp
//   process.env, KHÔNG schema/không validate → deploy thiếu biến chỉ vỡ lúc runtime muộn, .env.example
//   lệch với thực tế. Ở đây: 1 registry khai báo scope (public/server) + khi nào REQUIRED (theo feature
//   mode) + mô tả. `checkEnv()` báo missing/invalid theo mode mà KHÔNG lộ giá trị (chỉ tên biến).
// LUẬT THÉP: secret server KHÔNG BAO GIỜ mang tên NEXT_PUBLIC_ (assertServerSecretsPrivate).
// KHÔNG enforce-at-startup toàn cục (tránh outage do required non-đúng lúc) — dùng để kiểm/health/CI.
//   PURE: chỉ đọc env truyền vào; không import ngoài → test Node trực tiếp.
// ============================================================

export type EnvScope = 'public' | 'server'
export type EnvVar = {
  name: string
  scope: EnvScope
  secret?: boolean // true = giá trị nhạy cảm (không log, không đưa ra client)
  // required(env): biến BẮT BUỘC trong ngữ cảnh env hiện tại (theo feature mode). Mặc định optional.
  required?: (env: Record<string, string | undefined>) => boolean
  describe: string
}

const isProd = (e: Record<string, string | undefined>) => e.NODE_ENV === 'production'
const aiMock = (e: Record<string, string | undefined>) => e.WRITING_GRADER_MOCK === '1'
const paymentLive = (e: Record<string, string | undefined>) => e.PAYMENT_GATEWAY_MODE === 'live'

// Registry — nguồn sự thật duy nhất cho biến env. Thêm biến mới PHẢI khai ở đây (gate chặn drift).
export const ENV_REGISTRY: EnvVar[] = [
  // Core Supabase — luôn bắt buộc
  { name: 'NEXT_PUBLIC_SUPABASE_URL', scope: 'public', required: () => true, describe: 'URL project Supabase' },
  { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', scope: 'public', required: () => true, describe: 'Anon key Supabase (client, RLS)' },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', scope: 'server', secret: true, required: () => true, describe: 'Service role key (bypass RLS, server-only)' },
  { name: 'NEXT_PUBLIC_SITE_URL', scope: 'public', describe: 'Origin công khai (redirect/sitemap)' },
  // Cron — prod bắt buộc (route đã fail-closed 503 nếu thiếu)
  { name: 'CRON_SECRET', scope: 'server', secret: true, required: isProd, describe: 'Bearer cho Vercel Cron reconcile-topups' },
  // AI grading — cần key trừ khi mock; provider tường minh (AI-002)
  { name: 'WRITING_AI_PROVIDER', scope: 'server', describe: "anthropic|openai; sai → fail-loud (AI-002)" },
  { name: 'ANTHROPIC_API_KEY', scope: 'server', secret: true, required: (e) => !aiMock(e) && e.WRITING_AI_PROVIDER !== 'openai' && !e.OPENAI_API_KEY, describe: 'Key Claude (chấm Writing)' },
  { name: 'OPENAI_API_KEY', scope: 'server', secret: true, describe: 'Key OpenAI (nếu WRITING_AI_PROVIDER=openai)' },
  { name: 'WRITING_GRADER_MODEL', scope: 'server', describe: 'Override model Anthropic' },
  { name: 'WRITING_GRADER_OPENAI_MODEL', scope: 'server', describe: 'Override model OpenAI' },
  { name: 'WRITING_GRADER_OPENAI_MAX_OUTPUT_TOKENS', scope: 'server', describe: 'Budget output OpenAI (AI-003; reasoning tính vào đây, sàn 25000, mặc định 32000)' },
  { name: 'WRITING_GRADER_OPENAI_REASONING_EFFORT', scope: 'server', describe: 'none|low|medium|high|xhigh|max (AI-003; mặc định medium, sai → fail-loud)' },
  { name: 'WRITING_GRADER_MOCK', scope: 'server', describe: '1 = mock grader (dev/test)' },
  { name: 'WRITING_GRADER_TIMEOUT_MS', scope: 'server', describe: 'Deadline gọi provider (AI-001), mặc định 60000' },
  { name: 'AI_GRADE_IP_DAILY_LIMIT', scope: 'server', describe: 'Giới hạn chấm/ngày theo IP (free)' },
  { name: 'AI_GRADE_IP_RATE_LIMIT_PEPPER', scope: 'server', secret: true, describe: 'Pepper hash IP rate-limit' },
  // Activation codes
  { name: 'ACTIVATION_CODE_PEPPER', scope: 'server', secret: true, describe: 'Pepper HMAC mã kích hoạt (W14)' },
  // Payment — chung + live
  { name: 'PAYMENT_GATEWAY_MODE', scope: 'server', describe: 'sandbox|live|disabled' },
  { name: 'NEXT_PUBLIC_PAYMENT_PROVIDERS', scope: 'public', describe: 'Danh sách provider hiện ở UI' },
  { name: 'PAYMENT_WEBHOOK_SECRET', scope: 'server', secret: true, required: paymentLive, describe: 'Xác thực webhook thanh toán (live)' },
  { name: 'SEPAY_API_KEY', scope: 'server', secret: true, describe: 'SePay API key (live)' },
  { name: 'SEPAY_WEBHOOK_SECRET', scope: 'server', secret: true, describe: 'SePay webhook secret (live)' },
  { name: 'SEPAY_BANK_ACCOUNT', scope: 'server', describe: 'Số tài khoản nhận (SePay)' },
  { name: 'SEPAY_BANK_CODE', scope: 'server', describe: 'Mã ngân hàng (SePay)' },
  { name: 'MOMO_PARTNER_CODE', scope: 'server', describe: 'MoMo partner code' },
  { name: 'MOMO_ACCESS_KEY', scope: 'server', secret: true, describe: 'MoMo access key' },
  { name: 'MOMO_SECRET', scope: 'server', secret: true, describe: 'MoMo secret (ký)' },
  { name: 'MOMO_ENDPOINT', scope: 'server', describe: 'Override endpoint MoMo' },
  { name: 'VNPAY_TMN_CODE', scope: 'server', describe: 'VNPay terminal code' },
  { name: 'VNPAY_SECRET', scope: 'server', secret: true, describe: 'VNPay hash secret' },
  { name: 'VNPAY_URL', scope: 'server', describe: 'Override endpoint VNPay' },
  { name: 'TOPUP_MAX_PENDING', scope: 'server', describe: 'Trần topup pending/user (PAY-003)' },
  // Storage / R2
  { name: 'SUPABASE_STORAGE_BUCKET', scope: 'server', describe: 'Bucket Storage cho audio/media' },
  { name: 'MEDIA_ALLOWED_ORIGINS', scope: 'server', describe: 'Origin CDN bổ sung cho cover (STORE-003)' },
  { name: 'STORAGE_ORPHAN_GRACE_DAYS', scope: 'server', describe: 'Grace dọn orphan object (STORE-001, mặc định 7)' },
  { name: 'STORAGE_ORPHAN_CLEANUP_ENABLED', scope: 'server', describe: 'true = xoá thật orphan (STORE-001, mặc định dry-run)' },
  { name: 'R2_ACCOUNT_ID', scope: 'server', describe: 'Cloudflare R2 account id' },
  { name: 'R2_ACCESS_KEY_ID', scope: 'server', secret: true, describe: 'R2 access key id' },
  { name: 'R2_SECRET_ACCESS_KEY', scope: 'server', secret: true, describe: 'R2 secret access key' },
  { name: 'R2_BUCKET', scope: 'server', describe: 'R2 bucket name' },
  { name: 'R2_ENDPOINT', scope: 'server', describe: 'R2 S3 endpoint' },
  { name: 'R2_URL_TTL_SEC', scope: 'server', describe: 'TTL presigned URL R2 (giây)' },
  // Hạ tầng
  { name: 'TRUST_FORWARDED_IP', scope: 'server', describe: '1 = tin X-Forwarded-For (sau proxy tin cậy)' },
]

// LUẬT THÉP: secret server không được mang tên NEXT_PUBLIC_ (bundle ra client). Trả danh sách vi phạm.
export function assertServerSecretsPrivate(registry: EnvVar[] = ENV_REGISTRY): string[] {
  return registry.filter((v) => v.secret && v.name.startsWith('NEXT_PUBLIC_')).map((v) => v.name)
}

// Kiểm env theo mode hiện tại → { missing, publicScopeViolations }. CHỈ trả TÊN biến, KHÔNG giá trị.
export function checkEnv(env: Record<string, string | undefined> = process.env, registry: EnvVar[] = ENV_REGISTRY) {
  const missing: string[] = []
  for (const v of registry) {
    if (v.required?.(env) && !env[v.name]) missing.push(v.name)
  }
  return { ok: missing.length === 0, missing, secretsAsPublic: assertServerSecretsPrivate(registry) }
}
