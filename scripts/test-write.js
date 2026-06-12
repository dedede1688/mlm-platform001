const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function test() {
  const c = await p.systemConfig.findFirst()
  if (!c) {
    console.log('没有数据')
    return
  }

  const fullAddress = '广州市花都区金谷南路9号'
  const fullName = '广州敏维生物科技有限公司'

  console.log('写入前:')
  console.log('  companyAddress:', JSON.stringify(c.companyAddress), '长度:', c.companyAddress?.length)
  console.log('  companyName:', JSON.stringify(c.companyName), '长度:', c.companyName?.length)

  // 直接 update
  await p.systemConfig.update({
    where: { id: c.id },
    data: {
      companyAddress: fullAddress,
      companyName: fullName,
    }
  })

  const updated = await p.systemConfig.findUnique({ where: { id: c.id } })
  console.log('\n写入后:')
  console.log('  companyAddress:', JSON.stringify(updated.companyAddress), '长度:', updated.companyAddress?.length)
  console.log('  companyName:', JSON.stringify(updated.companyName), '长度:', updated.companyName?.length)
}

test().catch(console.error).finally(() => p.$disconnect())
