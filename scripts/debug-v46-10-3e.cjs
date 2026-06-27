const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
;(async () => {
  const b = await p.notificationBatch.findMany({
    where: { type: 'business' },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { notifications: { select: { id: true, title: true, userId: true, isRead: true } } },
  })
  console.log('=== business batches ===')
  console.log(JSON.stringify(b, null, 2))

  console.log('\n=== test account (1490ac44) notifications 最新 5 条 ===')
  const ns = await p.notification.findMany({
    where: { userId: '1490ac44-c967-4110-ae53-321b3e6e13f8' },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })
  for (const n of ns) {
    console.log(`${n.title} | type=${n.type} | source=${n.sourceType} | ${n.createdAt.toISOString()}`)
  }
  await p.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })