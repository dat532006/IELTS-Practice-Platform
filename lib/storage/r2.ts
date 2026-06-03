import 'server-only'
import { createHash, createHmac } from 'node:crypto'

// ============================================================
// W7 — Cloudflare R2 signed audio URL (M03).
// Contract: docs/ContractForAI/BackendEngineer/phase2/W7/w7_listening_audio_contract.md §3
//
// 🔐🔐 SERVER-ONLY ('server-only' chặn import từ client). Ký SigV4 query-presign GET
//   bằng node:crypto (KHÔNG thêm dependency S3 SDK). R2 tương thích S3 (region 'auto').
// - R2 secret (R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY) chỉ là server env (LUẬT THÉP #5).
//   KHÔNG prefix NEXT_PUBLIC_, KHÔNG log secret, KHÔNG nhúng secret vào URL.
// - Signed URL có TTL NGẮN (X-Amz-Expires) → hết hạn, KHÔNG phải public permanent URL.
// - Thiếu R2 env → trả { url: null, warning: 'R2_NOT_CONFIGURED' } (fallback rõ; exam KHÔNG crash).
// ============================================================

export type R2Warning = 'R2_NOT_CONFIGURED'
export type SignResult = { url: string | null; warning: R2Warning | null }

const DEFAULT_TTL_SEC = 300
const MIN_TTL_SEC = 60
const MAX_TTL_SEC = 900 // ngắn — KHÔNG cấp URL sống lâu
const REGION = 'auto' // R2
const SERVICE = 's3'

// RFC3986 encode (AWS variant): chỉ A-Za-z0-9-_.~ là an toàn; còn lại %-encode.
// encodeSlash=false → giữ '/' (dùng cho canonical path segments đã tách sẵn).
function awsUriEncode(input: string, encodeSlash = true): string {
  const bytes = Buffer.from(input, 'utf8')
  let out = ''
  for (const b of bytes) {
    const safe =
      (b >= 0x41 && b <= 0x5a) || // A-Z
      (b >= 0x61 && b <= 0x7a) || // a-z
      (b >= 0x30 && b <= 0x39) || // 0-9
      b === 0x2d || // -
      b === 0x5f || // _
      b === 0x2e || // .
      b === 0x7e // ~
    if (safe) {
      out += String.fromCharCode(b)
    } else if (b === 0x2f && !encodeSlash) {
      out += '/'
    } else {
      out += '%' + b.toString(16).toUpperCase().padStart(2, '0')
    }
  }
  return out
}

const sha256Hex = (data: string): string => createHash('sha256').update(data, 'utf8').digest('hex')
const hmac = (key: Buffer | string, data: string): Buffer => createHmac('sha256', key).update(data, 'utf8').digest()

function readConfig() {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  // endpoint: R2_ENDPOINT đầy đủ, hoặc dựng từ R2_ACCOUNT_ID.
  const accountId = process.env.R2_ACCOUNT_ID
  const endpoint =
    process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined)
  if (!accessKeyId || !secretAccessKey || !bucket || !endpoint) return null
  let host: string
  try {
    host = new URL(endpoint).host
  } catch {
    return null
  }
  return { accessKeyId, secretAccessKey, bucket, host }
}

// Ưu tiên: ttl caller truyền (nếu hợp lệ) > env R2_URL_TTL_SEC > DEFAULT_TTL_SEC; clamp 60..900s.
// ttlSec để OPTIONAL (không default ở signR2GetUrl) → caller gọi bình thường = undefined → env có hiệu lực.
function clampTtl(ttlSec?: number): number {
  const envTtl = Number(process.env.R2_URL_TTL_SEC)
  const base =
    typeof ttlSec === 'number' && Number.isFinite(ttlSec) && ttlSec > 0
      ? ttlSec
      : Number.isFinite(envTtl) && envTtl > 0
        ? envTtl
        : DEFAULT_TTL_SEC
  return Math.min(MAX_TTL_SEC, Math.max(MIN_TTL_SEC, Math.floor(base)))
}

// SigV4 query-presigned GET (path-style: https://host/bucket/key?X-Amz-...).
// ttlSec optional: bỏ trống → clampTtl ưu tiên env R2_URL_TTL_SEC rồi mới DEFAULT_TTL_SEC.
export function signR2GetUrl(objectKey: string, ttlSec?: number): SignResult {
  const cfg = readConfig()
  if (!cfg) return { url: null, warning: 'R2_NOT_CONFIGURED' }
  if (!objectKey) return { url: null, warning: 'R2_NOT_CONFIGURED' }

  const { accessKeyId, secretAccessKey, bucket, host } = cfg
  const expires = clampTtl(ttlSec)

  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '') // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8) // YYYYMMDD
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`

  // Canonical URI (path-style): mã hóa từng segment, GIỮ '/'.
  const encodedKey = objectKey.split('/').map((s) => awsUriEncode(s)).join('/')
  const canonicalUri = `/${awsUriEncode(bucket)}/${encodedKey}`

  // Query params (chưa gồm signature) — sort theo key đã encode.
  const params: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host',
  }
  const canonicalQueryString = Object.keys(params)
    .map((k) => [awsUriEncode(k), awsUriEncode(params[k])] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')

  const canonicalHeaders = `host:${host}\n`
  const signedHeaders = 'host'
  const payloadHash = 'UNSIGNED-PAYLOAD'
  const canonicalRequest = [
    'GET',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n')

  // Signing key (KHÔNG bao giờ log/expose) — secret chỉ dùng để ký.
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp)
  const kRegion = hmac(kDate, REGION)
  const kService = hmac(kRegion, SERVICE)
  const kSigning = hmac(kService, 'aws4_request')
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex')

  const url = `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`
  return { url, warning: null }
}
