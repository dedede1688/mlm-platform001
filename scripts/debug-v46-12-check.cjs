const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
;(async () => {
  const b = await p.notificationBatch.findMany({
    where: { templateType: { in: ['refund_review', 'refund_completed'] } },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { notifications: { select: { id: true, title: true, userId: true, isRead: true } } },
  })
  console.log('=== refund batches ===')
  console.log(JSON.stringify(b, null, 2))

  console.log('\n=== test account (1490ac44) latest 3 notifications ===')
  const ns = await p.notification.findMany({
    where: { userId: '1490ac44-c967-4110-ae53-321b3e6e13f8' },
    orderBy: { createdAt: 'desc' },
    take: 3,
  })
  for (const n of ns) {
    console.log(`${n.title} | sourceType=${n.sourceType} | read=${n.isRead} | ${n.createdAt.toISOString()}`)
  }
  await p.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })