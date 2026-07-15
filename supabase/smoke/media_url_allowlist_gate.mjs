// Cover URL allowlist gate (STORE-003) — isAllowedPublicMediaUrl: chỉ URL origin allowlist + path object
// public mới hợp lệ; javascript:/data:/host lạ/tracker/path sai → false. Import trực tiếp (Node
// type-stripping; validator không 'server-only', không local import).
//   node supabase/smoke/media_url_allowlist_gate.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// load NEXT_PUBLIC_SUPABASE_URL trước khi import validator (validator đọc env lúc gọi).
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const { isAllowedPublicMediaUrl } = await import('../../lib/storage/media-url.ts')

let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

const SB = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
const good = `${SB}/storage/v1/object/public/media/2026/cover.png`

console.log('HỢP LỆ (phải true):')
check('Supabase Storage public URL', isAllowedPublicMediaUrl(good) === true, `${good}`)

console.log('\nKHÔNG hợp lệ (phải false):')
const bad = [
  ['javascript: scheme', 'javascript:alert(1)'],
  ['data: uri', 'data:image/png;base64,iVBORw0KGgo='],
  ['host lạ (tracker) đúng path', 'https://evil.example.com/storage/v1/object/public/media/x.png'],
  ['http host lạ', 'http://tracker.test/pixel.gif'],
  ['origin đúng, path sign (không public)', `${SB}/storage/v1/object/sign/media/x.png`],
  ['origin đúng, path lạ', `${SB}/anything/else.png`],
  ['file: scheme', 'file:///etc/passwd'],
  ['chuỗi rỗng', ''],
  ['không phải URL', 'not a url'],
  ['null', null],
  ['số', 12345],
  ['vào-origin-qua-userinfo', `https://${SB.replace('https://', '').replace('http://', '')}@evil.com/storage/v1/object/public/media/x.png`],
]
for (const [n, v] of bad) check(n, isAllowedPublicMediaUrl(v) === false, `got true for ${JSON.stringify(v)}`)

// Owner mở rộng origin qua MEDIA_ALLOWED_ORIGINS
console.log('\nMEDIA_ALLOWED_ORIGINS (Owner extend):')
process.env.MEDIA_ALLOWED_ORIGINS = 'https://cdn.example.com'
check('CDN đã duyệt + path public → true', isAllowedPublicMediaUrl('https://cdn.example.com/storage/v1/object/public/media/x.png') === true)
check('CDN đã duyệt nhưng path sai → false', isAllowedPublicMediaUrl('https://cdn.example.com/track.gif') === false)
delete process.env.MEDIA_ALLOWED_ORIGINS

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
