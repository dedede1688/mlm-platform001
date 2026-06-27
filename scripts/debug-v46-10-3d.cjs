const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
;(async () => {
  const u = await p.user.findUnique({
    where: { phone: '13800138001' },
    select: { id: true, paymentPasswordHash: true, balance: true },
  })
  console.log('user:', u)
  await p.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })