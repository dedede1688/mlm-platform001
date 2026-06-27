/**
 * v51.5: 内存级 API 缓存
 *
 * 设计目标：
 * - 减少 admin dashboard / reports 等高频接口的 prisma.aggregate 调用
 * - 5 分钟 TTL（短过期避免脏数据）
 * - Vercel Serverless 环境每个 lambda 实例独立缓存（单实例命中率有效）
 *
 * 失效策略：
 * - 写操作路由（订单/退款/调账等）调 invalidate('admin-stats') 主动清缓存
 * - TTL 到期自然失效
 *
 * 限制：
 * - 不适合高频写入场景（缓存反复失效）
 * - 不适合强一致性要求（如支付结果）
 * - 仅用于"统计/报表类只读"接口
 */

interface CacheEntry<T> {
  data: T
  expires: number  // ms timestamp
}

// 使用 globalThis 避免 Vercel 冷启动时模块重载导致缓存丢失
// （生产环境实际效果有限，但开发环境稳定）
declare global {
  // eslint-disable-next-line no-var
  var __statsCache: Map<string, CacheEntry<unknown>> | undefined
}

const cache: Map<string, CacheEntry<unknown>> = globalThis.__statsCache ?? new Map()
if (!globalThis.__statsCache) globalThis.__statsCache = cache

const DEFAULT_TTL_MS = 5 * 60 * 1000  // 5 分钟

/**
 * 缓存包装函数：第一次调用执行 fn，结果缓存 5 分钟
 */
export async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  const now = Date.now()
  const entry = cache.get(key)
  if (entry && entry.expires > now) {
    return entry.data as T
  }

  // 缓存过期或不存在，执行原函数
  const data = await fn()
  cache.set(key, { data, expires: now + ttlMs })
  return data
}

/**
 * 失效缓存
 * @param prefix 可选，按 key 前缀失效（如 'admin-stats' 清掉所有 admin-stats:*）
 */
export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    cache.clear()
    return
  }
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) {
      cache.delete(k)
    }
  }
}

/**
 * 查看缓存状态（调试用）
 */
export function getCacheStats() {
  const now = Date.now()
  let alive = 0
  let expired = 0
  for (const entry of cache.values()) {
    if (entry.expires > now) alive++
    else expired++
  }
  return { total: cache.size, alive, expired }
}
