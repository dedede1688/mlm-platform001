import { PointsService } from '@/lib/services/points.service'
import { logger } from '@/lib/logger'
import { DividendService } from '@/lib/services/dividend.service'
import { OrderLifecycleService } from '@/lib/services/order-lifecycle.service'

// 每日任务（含分红快照，不含入账）
export async function runDailyTasks() {
  logger.info('========================================')
  logger.info('  每日任务执行开始')
  logger.info('  时间:', { time: new Date().toLocaleString('zh-CN') })
  logger.info('========================================\n')

  const results: { pointsUnlock?: { success: boolean; count?: number; error?: string }; dividendSnapshot?: { success: boolean; data?: unknown; error?: string }; autoCompleteOrders?: { success: boolean; count?: number; error?: string } } = {}

  try {
    // 1. 执行积分解锁
    const unlockCount = await PointsService.dailyUnlock()
    logger.info(`✅ 积分解锁完成: ${unlockCount} 条记录已处理`)
    results.pointsUnlock = { success: true, count: unlockCount }
  } catch (error) {
    logger.error('❌ 积分解锁失败', { error: error instanceof Error ? error.message : String(error) })
    results.pointsUnlock = { success: false, error: error instanceof Error ? error.message : '未知错误' }
  }

  try {
    // 2. 执行分红快照（v3 周结模式：每日只生成明细，不入账）
    const dividendResult = await DividendService.snapshotDailyDividends()
    logger.info('✅ 分红快照完成', { data: dividendResult })
    results.dividendSnapshot = { success: true, data: dividendResult }
  } catch (error) {
    logger.error('❌ 分红快照失败', { error: error instanceof Error ? error.message : String(error) })
    results.dividendSnapshot = { success: false, error: error instanceof Error ? error.message : '未知错误' }
  }

  // 3. v50 L: 自动确认收货
  try {
    const autoCompletedCount = await OrderLifecycleService.autoCompleteOrders()
    logger.info(`✅ 自动确认收货完成: ${autoCompletedCount} 个订单已处理`)
    results.autoCompleteOrders = { success: true, count: autoCompletedCount }
  } catch (error) {
    logger.error('❌ 自动确认收货失败', { error: error instanceof Error ? error.message : String(error) })
    results.autoCompleteOrders = { success: false, error: error instanceof Error ? error.message : '未知错误' }
  }

  logger.info('\n========================================')
  logger.info('  每日任务执行完毕')
  logger.info('========================================\n')

  return results
}

// 每周任务（分红入账）
export async function runWeeklyTasks() {
  logger.info('========================================')
  logger.info('  每周任务执行开始')
  logger.info('  时间:', { time: new Date().toLocaleString('zh-CN') })
  logger.info('========================================\n')

  const results: { dividendSettle?: { success: boolean; data?: unknown; error?: string } } = {}

  try {
    // 1. 执行分红周结入账（把本周未结算明细统一入账）
    const dividendResult = await DividendService.settleWeeklyDividends()
    logger.info('✅ 分红周结入账完成', { data: dividendResult })
    results.dividendSettle = { success: true, data: dividendResult }
  } catch (error) {
    logger.error('❌ 分红周结入账失败', { error: error instanceof Error ? error.message : String(error) })
    results.dividendSettle = { success: false, error: error instanceof Error ? error.message : '未知错误' }
  }

  logger.info('\n========================================')
  logger.info('  每周任务执行完毕')
  logger.info('========================================\n')

  return results
}

// 如果直接运行此文件
if (require.main === module) {
  const task = process.argv[2] || 'daily'
  const runner = task === 'weekly' ? runWeeklyTasks : runDailyTasks
  runner()
    .then(result => {
      const allSuccess = Object.values(result).every(r => r.success)
      if (allSuccess) {
        logger.info(`${task === 'weekly' ? '每周' : '每日'}任务全部执行成功`, { result })
        process.exit(0)
      } else {
        logger.error(`部分${task === 'weekly' ? '每周' : '每日'}任务执行失败`, { result })
        process.exit(1)
      }
    })
    .catch(error => {
      logger.error(`${task === 'weekly' ? '每周' : '每日'}任务执行异常`, { error: error instanceof Error ? error.message : String(error) })
      process.exit(1)
    })
}
