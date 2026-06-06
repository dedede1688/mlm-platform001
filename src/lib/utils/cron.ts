import { PointsService } from '@/lib/services/points.service'

// 每日任务
export async function runDailyTasks() {
  console.log('========================================')
  console.log('  每日任务执行开始')
  console.log('  时间:', new Date().toLocaleString('zh-CN'))
  console.log('========================================\n')

  try {
    // 执行积分解锁
    const unlockCount = await PointsService.dailyUnlock()
    console.log(`✅ 积分解锁完成: ${unlockCount} 条记录已处理`)

    console.log('\n========================================')
    console.log('  每日任务执行完毕')
    console.log('========================================\n')

    return { success: true, unlockCount }
  } catch (error) {
    console.error('❌ 每日任务执行失败:', error)
    return { success: false, error: error instanceof Error ? error.message : '未知错误' }
  }
}

// 如果直接运行此文件
if (require.main === module) {
  runDailyTasks()
    .then(result => {
      if (result.success) {
        console.log('每日任务执行成功')
        process.exit(0)
      } else {
        console.error('每日任务执行失败:', result.error)
        process.exit(1)
      }
    })
    .catch(error => {
      console.error('每日任务执行异常:', error)
      process.exit(1)
    })
}