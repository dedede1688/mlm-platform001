// 查所有 type 的 Notification，看 13800138003 用户的实际通知记录
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const TEST_PHONE = '13800138003'
;(async () => {
  const u = await p.user.findUnique({ where: { phone: TEST_PHONE } })
  const all = await p.notification.findMany({
    where: { userId: u.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })
  console.log(`用户 ${TEST_PHONE} 的所有通知:`)
  for (const n of all) {
    console.log(`  [${n.createdAt.toISOString()}] type=${n.type} | title=${n.title}`)
    console.log(`    content: ${n.content}`)
    console.log(`    isRead=${n.isRead} | batchId=${n.batchId}`)
  }
  if (all.length === 0) {
    console.log('  (空) - 当前没有通知记录（已被清理脚本删除）')
  }
  // 同时查 batch
  const batches = await p.notificationBatch.findMany({
    where: { templateType: 'points_unlock' },
    orderBy: { createdAt: 'desc' },
    take: 3,
  })
  console.log(`\n所有 points_unlock batch:`)
  for (const b of batches) {
    console.log(`  [${b.createdAt.toISOString()}] id=${b.id} | title=${b.title} | recipientCount=${b.recipientCount}`)
  }
  await p.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
