/**
 * 速率限制工具
 * 使用内存缓存实现，无需额外依赖
 */

interface RateLimitEntry {
  count: number
  resetTime: number
}

// 内存缓存存储
const rateLimitCache = new Map<string, RateLimitEntry>()

// 定期清理过期条目（每5分钟清理一次）
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of rateLimitCache.entries()) {
    if (now > value.resetTime) {
      rateLimitCache.delete(key)
    }
  }
}, 5 * 60 * 1000)

/**
 * 检查速率限制
 * @param key 限制键（可以是IP、用户名等）
 * @param limit 最大请求次数
 * @param windowMs 时间窗口（毫秒）
 * @returns { allowed: boolean, remaining: number, resetTime: number }
 */
export function checkRateLimit(
  key: string,
  limit: number = 5,
  windowMs: number = 60 * 1000 // 默认1分钟
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now()
  const entry = rateLimitCache.get(key)

  // 如果没有记录或已过期，创建新记录
  if (!entry || now > entry.resetTime) {
    const resetTime = now + windowMs
    rateLimitCache.set(key, { count: 1, resetTime })
    return { allowed: true, remaining: limit - 1, resetTime }
  }

  // 检查是否超过限制
  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetTime: entry.resetTime }
  }

  // 增加计数
  entry.count++
  rateLimitCache.set(key, entry)
  return { allowed: true, remaining: limit - entry.count, resetTime: entry.resetTime }
}

/**
 * 重置速率限制
 * @param key 限制键
 */
export function resetRateLimit(key: string): void {
  rateLimitCache.delete(key)
}

/**
 * 获取客户端IP地址
 * @param request NextRequest对象
 * @returns IP地址字符串
 */
export function getClientIP(request: Request): string {
  // 尝试从多个可能的header中获取IP
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }

  const realIP = request.headers.get('x-real-ip')
  if (realIP) {
    return realIP
  }

  // 如果都没有，返回unknown
  return 'unknown'
}
