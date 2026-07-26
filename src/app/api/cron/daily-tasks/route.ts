import { NextRequest } from 'next/server'
import { runDailyTasks } from '@/lib/utils/cron'
import { errorResponse, successResponse } from '@/lib/api-response'
import { logger } from '@/lib/logger'

// v3 周结模式: Vercel Cron 入口路由（每天 00:00 UTC = 北京时间 8:00 触发）
// 任务链：
//   1. PointsService.dailyUnlock() - 积分每日释放
//   2. DividendService.snapshotDailyDividends() - 分红每日快照（不入账，周结时统一入账）
//   3. OrderService.autoCompleteOrders() - 自动确认收货
export async function GET(request: NextRequest) {
  // v50 L 安全：验证 cron secret（防止外部恶意触发）
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    logger.warn('[v50 L daily-tasks] 非法 cron 触发', {
      ip: request.headers.get('x-forwarded-for') || 'unknown',
    })
    return errorResponse('Unauthorized', 401)
  }

  logger.info('[v50 L daily-tasks] Cron 触发开始')
  const startTime = Date.now()

  try {
    const result = await runDailyTasks()
    const duration = Date.now() - startTime

    logger.info('[v50 L daily-tasks] Cron 执行完毕', { result, duration })
    return successResponse({ duration, result })
  } catch (error) {
    const message = error instanceof Error ? error.message : '执行失败'
    logger.error('[v50 L daily-tasks] Cron 执行失败', { error: message })
    return errorResponse(message, 500)
  }
}
