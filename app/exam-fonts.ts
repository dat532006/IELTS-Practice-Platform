import { Plus_Jakarta_Sans, Newsreader } from 'next/font/google'

// Shared fonts for the exam / writing / result interface (dc-exam scope). Exposed as CSS
// variables (--font-jakarta / --font-newsreader) and consumed by app/exam.css, mirroring
// how app/page.tsx wires the landing fonts. Wrap the runner in a div with `examFontVars`.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
})
const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['italic'],
  variable: '--font-newsreader',
  display: 'swap',
})

export const examFontVars = `${jakarta.variable} ${newsreader.variable}`
