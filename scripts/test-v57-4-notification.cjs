// v57.4 验收：建测试 schedule → 触发 cron → 验证通知链路 → 清理
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const TEST_PHONE = '13800138003'

async function snap(label) {
  const u = await p.user.findUnique({ where: { phone: TEST_PHONE } })
  const s = await p.pointsUnlockSchedule.findFirst({
    where: { userId: u.id, status: 'active' },
  })
  const n = await p.notification.findMany({
    where: { userId: u.id, type: 'in_app' },
    orderBy: { createdAt: 'desc' },
    take: 3,
  })
  const b = await p.notificationBatch.findFirst({
    where: { templateType: 'points_unlock' },
    orderBy: { createdAt: 'desc' },
  })
  console.log(`\n=== ${label} ===`)
  console.log(`user: total=${u.totalPoints} | unlocked=${u.unlockedPoints} | locked=${u.lockedPoints}`)
  if (s) {
    console.log(`schedule: remaining=${s.remainingPoints} | completedDays=${s.completedDays} | nextUnlock=${s.nextUnlockDate.toISOString()}`)
  } else {
    console.log('schedule: 无 active schedule')
  }
  console.log(`最近 3 条 in_app notification:`)
  for (const x of n) {
    console.log(`  - [${x.createdAt.toISOString()}] ${x.title} | ${x.content} | read=${x.isRead}`)
  }
  if (b) {
    console.log(`最新 points_unlock batch: id=${b.id} | title=${b.title} | createdAt=${b.createdAt.toISOString()}`)
  }
}

;(async () => {
  try {
    // 0. 找用户
    const u = await p.user.findUnique({ where: { phone: TEST_PHONE } })
    if (!u) { console.error('用户不存在'); process.exit(1) }

    // 1. 清理：先看有没有遗留 schedule
    const oldS = await p.pointsUnlockSchedule.findFirst({ where: { userId: u.id, status: 'active' } })
    if (oldS) {
      console.log(`清理旧 schedule: ${oldS.id}`)
      await p.pointsUnlockSchedule.delete({ where: { id: oldS.id } })
    }
    // 清理：先看有没有遗留 notification
    const oldN = await p.notification.deleteMany({ where: { userId: u.id, type: 'in_app' } })
    console.log(`清理老 notification: ${oldN.count} 条`)

    // 2. 准备：给 user 充值 1000 锁定积分（让 dailyUnlock 数据看起来合理）
    await p.user.update({
      where: { id: u.id },
      data: { totalPoints: 1000, lockedPoints: 1000, unlockedPoints: 0 },
    })

    // 3. 建测试 schedule：nextUnlockDate=昨天（已过期）
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const newS = await p.pointsUnlockSchedule.create({
      data: {
        userId: u.id,
        orderId: '',
        totalPoints: 1000,
        remainingPoints: 1000,
        unlockedPoints: 0,
        totalDays: 100,
        completedDays: 0,
        dailyUnlockRate: 0.01,
        nextUnlockDate: yesterday,
        status: 'active',
      },
    })
    console.log(`建测试 schedule: id=${newS.id} | nextUnlockDate=${yesterday.toISOString()}`)

    await snap('触发 cron 前')

    // 4. 触发 cron
    console.log('\n=== 触发 /api/cron/daily-tasks ===')
    const resp = await fetch('https://mlm-platform001.vercel.app/api/cron/daily-tasks', { method: 'GET' })
    const data = await resp.json()
    console.log(`HTTP ${resp.status}:`)
    console.log(JSON.stringify(data, null, 2))

    // 5. 验证
    await snap('触发 cron 后')

    // 6. 清理
    console.log('\n=== 清理测试数据 ===')
    const newS2 = await p.pointsUnlockSchedule.findFirst({ where: { userId: u.id, status: 'active' } })
    if (newS2) {
      await p.pointsUnlockSchedule.delete({ where: { id: newS2.id } })
      console.log(`删除 schedule: ${newS2.id}`)
    }
    const newN = await p.notification.deleteMany({ where: { userId: u.id, type: 'in_app' } })
    console.log(`删除 notification: ${newN.count} 条`)
    await p.user.update({
      where: { id: u.id },
      data: { totalPoints: 0, lockedPoints: 0, unlockedPoints: 0 },
    })
    console.log('user 积分清零')

    console.log('\n=== 验收完成 ===')
  } catch (e) {
    console.error('ERROR:', e)
    process.exit(1)
  } finally {
    await p.$disconnect()
  }
})()
