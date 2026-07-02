const createNextIntlPlugin = require('next-intl/plugin')

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 构建时忽略 ESLint 错误
  eslint: {
    ignoreDuringBuilds: true,
  },
  // 增加 Server Actions 请求体大小限制
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  // 图片优化配置
  images: {
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30天缓存
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.in',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
  // 压缩优化
  compress: true,
  // 生产环境移除 console
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  // v52.2: 全局安全 headers（防 XSS/点击劫持/MIME 嗅探/HTTPS 降级）
  async headers() {
    // CSP 注意：使用 unsafe-inline/unsafe-eval 兼容 Next.js 内联资源
    // （Next.js 14+ 可用 nonce 收紧，本期先宽松）
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
        ],
      },
      // /api/ 路由额外的 X-Permitted-Cross-Domain-Policies
      // v68.12 (铁律 18): API 路由强制 no-store —— Vercel CDN 之前缓存了某个
      // 老 deployment 的 404 响应(/api/products 等自定义 API 路由命中 x-vercel-cache: HIT),
      // 导致后续 deployment 全部返回缓存的 404。加 no-store 根除此类缓存 bug。
      // API 路由本就是 dynamic,不应该被 CDN 缓存。
      {
        source: '/api/:path*',
        headers: [
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
    ]
  },
}

module.exports = withNextIntl(nextConfig)
