const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  const config = await p.systemConfig.findFirst()
  if (!config) {
    console.log('数据库中没有 systemConfig 记录')
  } else {
    console.log('当前 logoUrl:', JSON.stringify(config.logoUrl))
    console.log('当前 siteName:', JSON.stringify(config.siteName))
  }
}

main().catch(console.error).finally(() => p.$disconnect())
