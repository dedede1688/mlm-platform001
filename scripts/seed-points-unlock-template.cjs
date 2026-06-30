// v57.4: seed points_unlock 通知模板（每日积分解锁通知）
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
;(async () => {
  const templates = [
    {
      type: 'points_unlock',
      channel: 'in_app',
      subject: '每日积分解锁通知',
      content:
        '【敏维科技】您的账户积分已自动解锁：\n解锁数量：{{unlockAmount}} 积分\n当前可用积分：{{newUnlockedPoints}}\n当前锁定积分：{{newLockedPoints}}\n连续解锁天数：第{{completedDays}}天',
    },
  ]
  for (const t of templates) {
    const existing = await p.notificationTemplate.findUnique({
      where: { type_channel: { type: t.type, channel: t.channel } },
    })
    if (existing) {
      console.log(`update existing template: ${t.type}`)
      await p.notificationTemplate.update({
        where: { type_channel: { type: t.type, channel: t.channel } },
        data: { subject: t.subject, content: t.content, enabled: true },
      })
    } else {
      console.log(`create new template: ${t.type}`)
      await p.notificationTemplate.create({ data: t })
    }
  }

  console.log('\n--- 验证 ---')
  const v = await p.notificationTemplate.findUnique({
    where: { type_channel: { type: 'points_unlock', channel: 'in_app' } },
  })
  console.log(JSON.stringify(v, null, 2))
  await p.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
