 * 每日任务脚本
 * 调用分红结算 API 及积分解锁任务
 * 用法: node scripts/daily-tasks.js
 */

const API_BASE = process.env.API_BASE || 'http://localhost:3000';

async function settleDividends() {
  console.log('========================================');
  console.log('  每日任务 - 分红结算');
  console.log('  时间:', new Date().toLocaleString('zh-CN'));
  console.log('========================================\n');

  try {
    // 首先检查今日是否已结算
    const checkResponse = await fetch(`${API_BASE}/api/admin/settle-dividends`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const checkResult = await checkResponse.json();
    if (checkResult.success && checkResult.data.isSettled) {
      console.log(`⚠️  今日分红已结算，跳过结算流程`);
      console.log(`   分红池: ¥${checkResult.data.totalAmount}`);
      console.log(`   已发放用户: ${checkResult.data.distributedUsers}人`);
      return;
    }

    // 执行分红结算
    const response = await fetch(`${API_BASE}/api/admin/settle-dividends`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const result = await response.json();

    if (result.success) {
      const data = result.data;
      console.log(`✅ 分红结算完成: ${data.message}`);
      console.log(`   分红池: ¥${data.dividendPool}`);
      console.log(`   订单总额: ¥${data.totalOrderAmount}`);
      console.log(`   参与订单数: ${data.totalOrders}`);
      console.log(`   符合条件用户: ${data.eligibleUsers}人`);
      console.log(`   实际发放用户: ${data.distributedUsers}人`);
      
      if (data.details && data.details.length > 0) {
        console.log('\n   发放明细:');
        for (const d of data.details) {
          console.log(`   - ${d.nickname || d.phone} (${d.levelName}): ¥${d.dividendAmount}`);
        }
      }
    } else {
      console.log(`❌ 分红结算失败: ${result.error}`);
    }
  } catch (error) {
    console.error('❌ 分红结算请求失败:', error.message);
  }
}

async function unlockPoints() {
  console.log('\n========================================');
  console.log('  每日任务 - 积分解锁');
  console.log('  时间:', new Date().toLocaleString('zh-CN'));
  console.log('========================================\n');

  try {
    // 直接调用积分解锁服务
    const { PointsService } = require('../dist/lib/services/points.service');
    const unlockCount = await PointsService.dailyUnlock();
    console.log(`✅ 积分解锁完成: ${unlockCount} 条记录已处理`);
  } catch (error) {
    console.error('❌ 积分解锁失败:', error.message);
  }
}

// 执行所有任务
async function runAllTasks() {
  try {
    await settleDividends();
    await unlockPoints();
  } catch (error) {
    console.error('❌ 每日任务执行失败:', error);
  }

  console.log('\n========================================');
  console.log('  每日任务执行完毕');
  console.log('========================================\n');
}

// 执行
runAllTasks().catch(console.error);