const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
;(async () => {
  // 把这 2 个测试账号的 schedule nextUnlockDate 改成 1 小时前
  // 这样 dailyUnlock 立即就能处理
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  console.log('目标 nextUnlockDate:', oneHourAgo.toISOString())

  const users = await p.user.findMany({
    where: { phone: { in: ['13800138001', '13800138002'] } },
    select: { id: true, phone: true },
  })
  const userIds = users.map((u) => u.id)
  console.log('userIds:', userIds)

  const result = await p.pointsUnlockSchedule.updateMany({
    where: {
      status: 'active',
      userId: { in: userIds },
    },
    data: { nextUnlockDate: oneHourAgo },
  })
  console.log('更新了', result.count, '条 schedule')

  // 查一下确认
  const schedules = await p.pointsUnlockSchedule.findMany({
    where: {
      status: 'active',
      userId: { in: userIds },
    },
    select: { id: true, nextUnlockDate: true, userId: true },
  })
  schedules.forEach((s) => {
    const u = users.find((x) => x.id === s.userId)
    console.log(u?.phone, '| nextUnlockDate=', s.nextUnlockDate.toISOString())
  })

  await p.$disconnect()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
