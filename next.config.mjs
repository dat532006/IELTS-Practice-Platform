/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // F7 — ESLint đã cấu hình (.eslintrc.json = next/core-web-vitals) → enforce lint khi build. TypeScript check vẫn ON.
  eslint: { ignoreDuringBuilds: false },
}

export default nextConfig
