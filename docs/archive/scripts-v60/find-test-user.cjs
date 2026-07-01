// v57.4 验收：找 3 个候选测试账号
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
;(async () => {
  // 看 DB 里有哪几种 role
  const roleStats = await p.user.groupBy({
    by: ['role'],
    _count: { role: true },
  })
  console.log('=== role 分布 ===')
  console.log(JSON.stringify(roleStats, null, 2))

  // 找一个普通用户
  const candidates = await p.user.findMany({
    where: { phone: { notIn: ['13800138001', '13800138002'] } },
    select: {
      id: true,
      phone: true,
      nickname: true,
      role: true,
      totalPoints: true,
      unlockedPoints: true,
      lockedPoints: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 15,
  })
  console.log('=== 候选用户 ===')
  for (const u of candidates) {
    const s = await p.pointsUnlockSchedule.findFirst({
      where: { userId: u.id, status: 'active' },
    })
    const tag = s ? `[有schedule,nextUnlock=${s.nextUnlockDate.toISOString()}]` : '[无schedule]'
    console.log(`${u.phone} | role=${u.role} | total=${u.totalPoints} | unlocked=${u.unlockedPoints} | locked=${u.lockedPoints} | ${tag}`)
  }
  await p.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
