import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * C-7: 分布式 rate-limit helper（Supabase 数据库表）
 *
 * 设计目标：
 * - 基于数据库的滑动窗口计数器（key + 窗口期）
 * - 跨 Vercel 多实例共享（解决原 globalThis 内存级单实例限制）
 * - 防暴力破解：登录/注册/支付/调账 高风险路由限流
 *
 * 使用场景：
 * - 登录：5 次/分钟/IP + 5 次/分钟/账号（双维度防爆破）
 * - 注册：3 次/分钟/IP（防批量注册）
 * - 支付：10 次/分钟/IP（防暴力支付）
 * - 调账：10 次/分钟/IP（防暴力调账）
 *
 * 数据清理：
 * - 每次 checkRateLimit 调用时自动清理过期记录（resetAt <= now）
 * - 过期记录概率性 GC（每 100 次调用触发一次全表清理）
 */

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetIn: number  // ms until reset
}

let callCount = 0

/** 概率性清理过期记录（每 100 次调用触发一次） */
async function maybeCleanup() {
  callCount++
  if (callCount % 100 !== 0) return
  const now = BigInt(Date.now())
  try {
    await prisma.rateLimit.deleteMany({
      where: { resetAt: { lte: now } },
    })
  } catch {
    // 清理失败不阻塞业务
  }
}

/**
 * 检查是否超过限流阈值
 * @param key 唯一标识（建议格式：`<route>:<维度>:<值>` 如 `login:ip:1.2.3.4`）
 * @param limit 窗口期内允许的最大次数
 * @param windowMs 窗口期（毫秒）
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  await maybeCleanup()

  const now = Date.now()
  const nowBigInt = BigInt(now)
  const resetAt = now + windowMs

  try {
    const result = await prisma.rateLimit.upsert({
      where: { key },
      update: {
        count: { increment: 1 },
        resetAt: nowBigInt,
      },
      create: {
        key,
        count: 1,
        resetAt: BigInt(resetAt),
      },
    })

    // 检查当前记录是否还在窗口期内
    const recordResetAt = Number(result.resetAt)
    if (recordResetAt <= now) {
      // 窗口已过期，重置计数
      await prisma.rateLimit.update({
        where: { key },
        data: { count: 1, resetAt: BigInt(resetAt) },
      })
      return { allowed: true, remaining: limit - 1, resetIn: windowMs }
    }

    if (result.count > limit) {
      return { allowed: false, remaining: 0, resetIn: recordResetAt - now }
    }

    return { allowed: true, remaining: limit - result.count, resetIn: recordResetAt - now }
  } catch {
    // 数据库异常时放行（fail-open），避免限流服务故障阻断正常业务
    return { allowed: true, remaining: limit, resetIn: windowMs }
  }
}

/**
 * 获取客户端真实 IP（处理 Vercel/Cloudflare 反向代理）
 */
export function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp
  return (request as any).ip || 'unknown'
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
