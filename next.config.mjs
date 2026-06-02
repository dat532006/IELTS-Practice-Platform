/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Shell W1+2 chưa cấu hình ESLint; giữ TypeScript check ON (không bỏ qua lỗi type).
  eslint: { ignoreDuringBuilds: true },
}

export default nextConfig
