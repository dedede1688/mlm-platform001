import type { NextRequest } from 'next/server'

/**
 * v52.1: API rate-limit helper
 *
 * 设计目标：
 * - 内存级滑窗计数器（key + 窗口期）
 * - 防暴力破解：登录/注册/支付/调账 高风险路由限流
 * - Vercel Serverless 单实例有效（跨实例不共享，但有 60s 内单 IP 单实例的防护）
 *
 * 使用场景：
 * - 登录：5 次/分钟/IP + 5 次/分钟/账号（双维度防爆破）
 * - 注册：3 次/分钟/IP（防批量注册）
 * - 支付：10 次/分钟/IP（防暴力支付）
 * - 调账：10 次/分钟/IP（防暴力调账）
 *
 * 限制：
 * - 不适合分布式限流（多实例不共享计数）
 * - 不替代专业 WAF（Cloudflare/Netlify 等的 rate-limit）
 */

interface Bucket {
  count: number
  resetAt: number  // ms timestamp
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetIn: number  // ms until reset
}

// 使用 globalThis 持久化（避免 Vercel 冷启动重置）
declare global {
  // eslint-disable-next-line no-var
  var __rateLimitBuckets: Map<string, Bucket> | undefined
}

const buckets: Map<string, Bucket> = globalThis.__rateLimitBuckets ?? new Map()
if (!globalThis.__rateLimitBuckets) globalThis.__rateLimitBuckets = buckets

// 清理过期 bucket（每 1000 次调用触发一次 GC）
let callCount = 0
function maybeCleanup() {
  callCount++
  if (callCount % 1000 !== 0) return
  const now = Date.now()
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k)
  }
}

/**
 * 检查是否超过限流阈值
 * @param key 唯一标识（建议格式：`<route>:<维度>:<值>` 如 `login:ip:1.2.3.4`）
 * @param limit 窗口期内允许的最大次数
 * @param windowMs 窗口期（毫秒）
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  maybeCleanup()
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, resetIn: windowMs }
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, resetIn: bucket.resetAt - now }
  }

  bucket.count++
  return { allowed: true, remaining: limit - bucket.count, resetIn: bucket.resetAt - now }
}

/**
 * 获取客户端真实 IP（处理 Vercel/Cloudflare 反向代理）
 */
export function getClientIP(request: NextRequest): string {
  // 优先级：x-forwarded-for (Vercel/Cloudflare) > x-real-ip > request.ip
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp
  // @ts-expect-error NextRequest.ip 在某些版本可用
  return request.ip || 'unknown'
}

/**
 * 生成 rate-limit 错误响应（含 Retry-After header）
 */
export function rateLimitResponse(message: string, resetInMs: number): Response {
  return new Response(
    JSON.stringify({ success: false, error: message }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(Math.ceil(resetInMs / 1000)),
      },
    }
  )
}
