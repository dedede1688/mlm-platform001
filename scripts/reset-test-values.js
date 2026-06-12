const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function reset() {
  const config = await p.systemConfig.findFirst()
  if (!config) {
    console.log('没有 systemConfig 记录')
    return
  }

  // 重置为基础值
  await p.systemConfig.update({
    where: { id: config.id },
    data: {
      siteName: '敏维生物·健康商城',
      contactPhone: '18566793066',
      serviceEmail: 'service@minwei.com',
      serviceTime: '周一至周日 9:00-21:00',
      companyName: '广州敏维生物科技有限公司',
      companyAddress: '广州市花都区金谷南路9号',
      icp: '粤ICP备XXXXXXXX号',
      copyright: '2026',
    }
  })

  const updated = await p.systemConfig.findUnique({
    where: { id: config.id },
    select: {
      siteName: true,
      contactPhone: true,
      serviceEmail: true,
      serviceTime: true,
      companyName: true,
      companyAddress: true,
      icp: true,
      copyright: true,
    }
  })

  console.log('已重置为：')
  console.log(JSON.stringify(updated, null, 2))
}

reset().catch(console.error).finally(() => p.$disconnect())
