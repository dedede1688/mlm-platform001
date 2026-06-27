// v46.10.3 排查 v46.7 业务触发
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  console.log('===== 1. notification_batches 最新 10 条 =====')
  const batches = await p.notificationBatch.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
  })
  for (const b of batches) {
    console.log(`type=${b.type} | template=${b.templateType} | ${b.title} | ${b.createdAt.toISOString()} | sender=${b.senderId}`)
  }

  console.log('\n===== 2. notification_templates 看 order_paid 等模板 =====')
  const tpls = await p.notificationTemplate.findMany({
    where: { channel: 'in_app' },
  })
  for (const t of tpls) {
    console.log(`type=${t.type} | channel=${t.channel} | active=${t.isActive} | name=${t.name}`)
  }

  console.log('\n===== 3. 胡子哥测试账号 13800138001 用户信息 =====')
  const u = await p.user.findUnique({ where: { phone: '13800138001' } })
  console.log(`id=${u?.id} | role=${u?.role} | nickname=${u?.nickname}`)

  console.log('\n===== 4. 该用户最近 5 单 =====')
  if (u) {
    const orders = await p.order.findMany({
      where: { userId: u.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, orderNo: true, status: true, totalAmount: true, paidAt: true, createdAt: true },
    })
    for (const o of orders) {
      console.log(`${o.orderNo} | status=${o.status} | ¥${o.totalAmount} | paidAt=${o.paidAt?.toISOString()} | created=${o.createdAt.toISOString()}`)
    }
  }

  console.log('\n===== 5. 该用户 notifications 最近 10 条 =====')
  if (u) {
    const ns = await p.notification.findMany({
      where: { userId: u.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, type: true, title: true, isRead: true, sourceType: true, createdAt: true },
    })
    for (const n of ns) {
      console.log(`type=${n.type} | source=${n.sourceType} | ${n.title} | read=${n.isRead} | ${n.createdAt.toISOString()}`)
    }
  }

  await p.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })