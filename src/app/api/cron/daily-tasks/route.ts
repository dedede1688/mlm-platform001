import { NextRequest, NextResponse } from 'next/server'
import { runDailyTasks } from '@/lib/utils/cron'
import { logger } from '@/lib/logger'

// v50 L: Vercel Cron 入口路由（每天 0:00 UTC = 北京时间 8:00 触发）
// 任务链：
//   1. PointsService.dailyUnlock() - 积分每日释放
//   2. DividendService.settleDailyDividends() - 分红结算
//   3. OrderService.autoCompleteOrders() - 自动确认收货
export async function GET(request: NextRequest) {
  // v50 L 安全：验证 cron secret（防止外部恶意触发）
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    logger.warn('[v50 L daily-tasks] 非法 cron 触发', {
      ip: request.headers.get('x-forwarded-for') || 'unknown',
    })
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    )
  }

  logger.info('[v50 L daily-tasks] Cron 触发开始')
  const startTime = Date.now()

  try {
    const result = await runDailyTasks()
    const duration = Date.now() - startTime

    logger.info('[v50 L daily-tasks] Cron 执行完毕', { result, duration })
    return NextResponse.json({
      success: true,
      duration,
      result,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '执行失败'
    logger.error('[v50 L daily-tasks] Cron 执行失败', { error: message })
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
