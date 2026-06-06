/**
 * reset-database.js
 * 清空所有业务数据，保留 Product 和 SystemConfig 表
 * 
 * 运行方式：node reset-database.js
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

// 按外键依赖顺序排列，先删子表再删父表
const TABLES = [
  { model: 'withdrawal',            label: 'Withdrawal（提现记录）' },
  { model: 'reward',                label: 'Reward（奖励记录）' },
  { model: 'dividend',              label: 'Dividend（分红记录）' },
  { model: 'levelSnapshot',         label: 'LevelSnapshot（等级快照）' },
  { model: 'pointsUnlockSchedule',  label: 'PointsUnlockSchedule（积分解锁计划）' },
  { model: 'pointsRecord',          label: 'PointsRecord（积分记录）' },
  { model: 'orderItem',             label: 'OrderItem（订单商品）' },
  { model: 'order',                 label: 'Order（订单）' },
  { model: 'user',                  label: 'User（用户）' },
]

async function main() {
  console.log('==========================================')
  console.log('  数据库业务数据清理')
  console.log('  保留: Product, SystemConfig')
  console.log('==========================================\n')

  // 删除前统计
  console.log('--- 清理前统计 ---')
  for (const table of TABLES) {
    const count = await prisma[table.model].count()
    console.log(`  ${table.label}: ${count} 条`)
  }

  // 保留的表统计
  const productCount = await prisma.product.count()
  const configCount = await prisma.systemConfig.count()
  console.log(`  [保留] Product（商品）: ${productCount} 条`)
  console.log(`  [保留] SystemConfig（系统配置）: ${configCount} 条`)

  console.log('\n--- 开始清理 ---')

  // 按顺序删除
  for (const table of TABLES) {
    const result = await prisma[table.model].deleteMany()
    console.log(`  ${table.label}: 已清空 (删除 ${result.count} 条)`)
  }

  console.log('\n--- 清理后验证 ---')
  for (const table of TABLES) {
    const count = await prisma[table.model].count()
    console.log(`  ${table.label}: ${count} 条`)
  }

  // 确认保留数据完好
  const productAfter = await prisma.product.count()
  const configAfter = await prisma.systemConfig.count()
  console.log(`  [保留] Product（商品）: ${productAfter} 条 ${productAfter === productCount ? '✅' : '❌ 数量变化！'}`)
  console.log(`  [保留] SystemConfig（系统配置）: ${configAfter} 条 ${configAfter === configCount ? '✅' : '❌ 数量变化！'}`)

  console.log('\n==========================================')
  console.log('  数据清理完成')
  console.log('==========================================')

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('执行出错:', e)
  await prisma.$disconnect()
  process.exit(1)
})