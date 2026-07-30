// SEC-006 regression — chạy production sanitizer (lib/sanitize/passage-html-client.ts) trên corpus HTML độc.
// Node v24 strip TS types tự nhiên; DOMParser polyfill bằng htmlparser2 (đã cài) để chạy đúng walk() thật.
//   node supabase/smoke/sanitize_passage_client_test.mjs
import { register } from 'node:module'
import { parseDocument } from 'htmlparser2'

// --- DOMParser polyfill: bọc domhandler node thành W3C subset mà sanitizer dùng ---
function textContentOf(node) {
  if (node.type === 'text') return node.data ?? ''
  if (node.children) return node.children.map(textContentOf).join('')
  return ''
}
function wrap(node) {
  const isText = node.type === 'text'
  return {
    nodeType: isText ? 3 : 1,
    tagName: isText ? '' : String(node.name || '').toUpperCase(),
    textContent: textContentOf(node),
    get childNodes() { return (node.children || []).map(wrap) },
    getAttribute(name) { return node.attribs ? (node.attribs[name] ?? null) : null },
  }
}
globalThis.DOMParser = class {
  parseFromString(html) {
    const doc = parseDocument(html)
    return { body: { get childNodes() { return doc.children.map(wrap) } } }
  }
}

// Sanitizer import `@/lib/storage/media-url` — Node không đọc `paths` của tsconfig nên phải cấp resolver
//   trước, nếu không cả gate chết ở bước import (đúng chuyện đã xảy ra tới 2026-07-30).
register('./_ts-alias-hooks.mjs', import.meta.url)
const { sanitizePassageHtmlClient } = await import('../../lib/sanitize/passage-html-client.ts')

let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }
const has = (s, needle) => s.toLowerCase().includes(needle.toLowerCase())

// Corpus độc: mỗi input CHỨA token nguy hiểm ở raw; output KHÔNG được chứa.
const MALICIOUS = [
  { name: 'img onerror', html: '<p>Hi<img src=x onerror="fetch(1)"></p>', bad: ['onerror', '<img', 'fetch'] },
  { name: 'svg onload', html: '<p>t</p><svg onload="alert(1)"><circle/></svg>', bad: ['onload', '<svg', 'alert'] },
  { name: 'script tag', html: '<p>ok</p><script>steal()</script>', bad: ['<script', 'steal'] },
  { name: 'iframe', html: '<iframe src="javascript:alert(1)"></iframe>', bad: ['<iframe', 'javascript:'] },
  { name: 'a javascript href', html: '<p>x</p><a href="javascript:evil()">click</a>', bad: ['<a', 'javascript:', 'evil'] },
  { name: 'onclick on allowed tag', html: '<p onclick="hack()">para</p>', bad: ['onclick', 'hack'] },
  { name: 'style expression', html: '<p style="background:url(javascript:x)">y</p>', bad: ['background', 'javascript'] },
  { name: 'nested img in strong', html: '<strong>b<img src=1 onerror=x></strong>', bad: ['onerror', '<img'] },
  { name: 'data-uri img', html: '<p><img src="data:text/html,<script>1</script>"></p>', bad: ['<img', 'data:'] },
  { name: 'object/embed', html: '<object data="x"></object><embed src="y">', bad: ['<object', '<embed'] },
]

for (const c of MALICIOUS) {
  const out = sanitizePassageHtmlClient(c.html)
  // Baseline: raw CHỨA token (chứng minh vector có thật trước sanitize).
  const rawHasSomething = c.bad.some((b) => has(c.html, b))
  check(`[baseline] raw "${c.name}" chứa payload`, rawHasSomething)
  const survived = c.bad.filter((b) => has(out, b))
  check(`sanitize "${c.name}" loại hết payload`, survived.length === 0, `còn: ${survived.join(',')} | out=${out}`)
}

// Formatting hợp lệ phải được GIỮ.
const KEEP = [
  { name: 'bold/italic', html: '<p><strong>a</strong> <em>b</em></p>', want: ['<strong>', '<em>', 'a', 'b'] },
  { name: 'text-align center', html: '<p style="text-align:center">mid</p>', want: ['text-align:center', 'mid'] },
  { name: 'text-indent', html: '<p style="text-indent:2em">indent</p>', want: ['text-indent:2em'] },
  { name: 'heading + list', html: '<h2>T</h2><ul><li>one</li><li>two</li></ul>', want: ['<h2>', '<ul>', '<li>one</li>'] },
  { name: 'div->p', html: '<div>line</div>', want: ['<p>line</p>'] },
]
for (const c of KEEP) {
  const out = sanitizePassageHtmlClient(c.html)
  const missing = c.want.filter((w) => !has(out, w))
  check(`giữ formatting "${c.name}"`, missing.length === 0, `thiếu: ${missing.join(',')} | out=${out}`)
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
