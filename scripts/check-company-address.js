const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function check() {
  const c = await p.systemConfig.findFirst({
    select: { companyAddress: true, companyName: true, contactPhone: true, serviceTime: true }
  })
  console.log('数据库实际值:')
  console.log('companyAddress 长度:', c.companyAddress?.length)
  console.log('companyAddress 完整内容:', JSON.stringify(c.companyAddress))
  console.log('companyName 长度:', c.companyName?.length)
  console.log('companyName 完整内容:', JSON.stringify(c.companyName))
}

check().catch(console.error).finally(() => p.$disconnect())
