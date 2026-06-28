// v57.2: seed points_adjust 通知模板
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
;(async () => {
  const templates = [
    {
      type: 'points_adjust',
      channel: 'in_app',
      subject: '账户积分变动通知',
      content:
        '【敏维科技】您的账户积分发生变动：\n变动类型：{{fieldLabel}}\n变动数量：{{changeAmount}} 积分\n当前总积分：{{newTotalPoints}}\n可用积分：{{newUnlockedPoints}}\n锁定积分：{{newLockedPoints}}\n变动原因：{{reason}}\n如有疑问请联系客服。',
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
    where: { type_channel: { type: 'points_adjust', channel: 'in_app' } },
  })
  console.log(JSON.stringify(v, null, 2))
  await p.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
