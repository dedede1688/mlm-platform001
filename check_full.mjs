import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const prisma = new PrismaClient()

async function main() {
  console.log('===== 用户表 sample =====')
  const users = await prisma.user.findMany({
    take: 5,
    select: { id: true, phone: true, nickname: true, level: true, balance: true, totalPoints: true, unlockedPoints: true, lockedPoints: true, role: true, createdAt: true }
  })
  console.log('用户数:', users.length)
  for (const u of users) console.log(u)

  console.log('\n===== 用户总数 / 积分统计 =====')
  const userAgg = await prisma.user.aggregate({
    _count: true,
    _sum: { balance: true, totalPoints: true, unlockedPoints: true, lockedPoints: true }
  })
  console.log(userAgg)

  console.log('\n===== 订单总数 / 状态分布 =====')
  const orderCount = await prisma.order.count()
  console.log('订单总数:', orderCount)
  const orderByStatus = await prisma.order.groupBy({ by: ['status'], _count: true })
  console.log('订单状态分布:', orderByStatus)

  console.log('\n===== 订单最新 5 条 =====')
  const orders = await prisma.order.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { phone: true, nickname: true } }, items: { include: { product: { select: { name: true, isUpgradeProduct: true } } } } }
  })
  for (const o of orders) {
    console.log(`  [${o.status}] ${o.orderNo} 用户=${o.user?.phone} 总额=${o.totalAmount} 积分用=${o.pointsUsed} 实付=${o.payAmount} 升级商品=${o.items.some(i=>i.product.isUpgradeProduct)} 时间=${o.createdAt.toISOString()}`)
  }

  console.log('\n===== 积分记录总数 / 类型分布 =====')
  const pointsCount = await prisma.pointsRecord.count()
  console.log('积分记录总数:', pointsCount)
  const pointsByType = await prisma.pointsRecord.groupBy({ by: ['type'], _count: true, _sum: { amount: true } })
  console.log('积分类型分布:', pointsByType)

  console.log('\n===== 积分解锁计划 =====')
  const scheduleCount = await prisma.pointsUnlockSchedule.count()
  console.log('解锁计划总数:', scheduleCount)
  const scheduleByStatus = await prisma.pointsUnlockSchedule.groupBy({ by: ['status'], _count: true, _sum: { totalPoints: true, remainingPoints: true, unlockedPoints: true } })
  console.log('解锁计划状态:', scheduleByStatus)

  console.log('\n===== 奖励记录 =====')
  const rewardCount = await prisma.reward.count()
  console.log('奖励总数:', rewardCount)
  const rewardByType = await prisma.reward.groupBy({ by: ['type'], _count: true, _sum: { amount: true } })
  console.log('奖励类型:', rewardByType)

  console.log('\n===== 退款申请 =====')
  const refundCount = await prisma.refundRequest.count()
  console.log('退款申请总数:', refundCount)
  if (refundCount > 0) {
    const refundByStatus = await prisma.refundRequest.groupBy({ by: ['status'], _count: true })
    console.log('退款状态:', refundByStatus)
  }

  console.log('\n===== 购物车 =====')
  const cartCount = await prisma.cart.count()
  console.log('购物车条目:', cartCount)

  console.log('\n===== system_configs 关键业务字段 =====')
  const cfgs = await prisma.systemConfig.findMany({
    where: { OR: [{ siteName: { not: null } }, { key: 'site_settings' }] }
  })
  for (const c of cfgs) {
    console.log(`  key=${c.key} siteName=${c.siteName} icp=${c.icp} updatedAt=${c.updatedAt.toISOString()}`)
  }
}

main().catch(e => { console.error('ERROR:', e?.message ?? e); process.exit(1) }).finally(() => prisma.$disconnect())