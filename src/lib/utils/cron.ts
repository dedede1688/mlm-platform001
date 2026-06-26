import { PointsService } from '@/lib/services/points.service'
import { logger } from '@/lib/logger'
import { DividendService } from '@/lib/services/dividend.service'
import { OrderService } from '@/lib/services/order.service'

// 每日任务
export async function runDailyTasks() {
  logger.info('========================================')
  logger.info('  每日任务执行开始')
  logger.info('  时间:', { time: new Date().toLocaleString('zh-CN') })
  logger.info('========================================\n')

  const results: { pointsUnlock?: { success: boolean; count?: number; error?: string }; dividendSettle?: { success: boolean; data?: unknown; error?: string }; autoCompleteOrders?: { success: boolean; count?: number; error?: string } } = {}

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
    // 2. 执行分红结算
    const dividendResult = await DividendService.settleDailyDividends()
    logger.info('✅ 分红结算完成', { data: dividendResult })
    results.dividendSettle = { success: true, data: dividendResult }
  } catch (error) {
    logger.error('❌ 分红结算失败', { error: error instanceof Error ? error.message : String(error) })
    results.dividendSettle = { success: false, error: error instanceof Error ? error.message : '未知错误' }
  }

  // 3. v50 L: 自动确认收货
  try {
    const autoCompletedCount = await OrderService.autoCompleteOrders()
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

// 如果直接运行此文件
if (require.main === module) {
  runDailyTasks()
    .then(result => {
      const allSuccess = Object.values(result).every(r => r.success)
      if (allSuccess) {
        logger.info('每日任务全部执行成功', { result })
        process.exit(0)
      } else {
        logger.error('部分每日任务执行失败', { result })
        process.exit(1)
      }
    })
    .catch(error => {
      logger.error('每日任务执行异常', { error: error instanceof Error ? error.message : String(error) })
      process.exit(1)
    })
}