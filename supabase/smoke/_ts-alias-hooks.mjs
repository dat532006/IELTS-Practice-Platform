// Resolver hook cho smoke import THẲNG file production .ts (Node type-stripping).
// Node không đọc `paths` của tsconfig, nên bất kỳ file production nào dùng alias `@/...` đều làm smoke
// chết ngay ở bước import — ERR_MODULE_NOT_FOUND, KHÔNG assertion nào chạy, mà exit code lại giống hệt
// "assertion sai" nên rất dễ bị bỏ qua. (2026-07-30: sanitize_passage_client_test đã chết như vậy trong
// im lặng — gate sanitize SEC-006 chưa từng thực sự chạy.)
//
// Dùng trong smoke — PHẢI register trước rồi mới dynamic import:
//   import { register } from 'node:module'
//   register('./_ts-alias-hooks.mjs', import.meta.url)
//   const mod = await import('../../lib/…/x.ts')
//
// Tên bắt đầu bằng '_' nên scripts/run-smokes.mjs bỏ qua, không coi đây là một smoke.
import { existsSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolvePath(dirname(fileURLToPath(import.meta.url)), '..', '..')
const EXTENSIONS = ['', '.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx']

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith('@/')) return nextResolve(specifier, context)
  const base = resolvePath(root, specifier.slice(2))
  for (const ext of EXTENSIONS) {
    const candidate = `${base}${ext}`
    if (existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
