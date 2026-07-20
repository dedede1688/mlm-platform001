import { NextRequest, NextResponse } from 'next/server'
import { runWeeklyTasks } from '@/lib/utils/cron'
import { logger } from '@/lib/logger'

// v3 周结模式：Vercel Cron 入口路由（每周一 00:00 北京时间 = 周日 16:00 UTC 触发）
// 任务链：
//   1. DividendService.settleWeeklyDividends() - 把本周未结算分红明细统一入账
export async function GET(request: NextRequest) {
  // 安全：验证 cron secret（防止外部恶意触发）
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    logger.warn('[weekly-tasks] 非法 cron 触发', {
      ip: request.headers.get('x-forwarded-for') || 'unknown',
    })
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    )
  }

  logger.info('[weekly-tasks] Cron 触发开始')
  const startTime = Date.now()

  try {
    const result = await runWeeklyTasks()
    const duration = Date.now() - startTime

    logger.info('[weekly-tasks] Cron 执行完毕', { result, duration })
    return NextResponse.json({
      success: true,
      duration,
      result,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '执行失败'
    logger.error('[weekly-tasks] Cron 执行失败', { error: message })
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
