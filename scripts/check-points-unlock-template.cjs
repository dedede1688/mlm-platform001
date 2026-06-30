// v57.4: 检查 points_unlock 通知模板是否存在
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
;(async () => {
  const v = await p.notificationTemplate.findUnique({
    where: { type_channel: { type: 'points_unlock', channel: 'in_app' } },
  })
  if (v) {
    console.log(`exists: ${v.subject}`)
    console.log(`enabled: ${v.enabled}`)
  } else {
    console.log('NOT FOUND: points_unlock template does not exist')
  }
  await p.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
