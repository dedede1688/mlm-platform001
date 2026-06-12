const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function restore() {
  const c = await p.systemConfig.findFirst()
  if (!c) {
    console.log('没有数据')
    return
  }

  // 恢复为用户原本设置的值
  await p.systemConfig.update({
    where: { id: c.id },
    data: {
      companyName: '中国·广州敏维科技',
      companyAddress: '广州市花都区金谷南路',
    }
  })

  const updated = await p.systemConfig.findUnique({ where: { id: c.id } })
  console.log('已恢复为用户的原值:')
  console.log('  companyName:', JSON.stringify(updated.companyName))
  console.log('  companyAddress:', JSON.stringify(updated.companyAddress))
}

restore().catch(console.error).finally(() => p.$disconnect())
