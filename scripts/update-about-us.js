const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const p = new PrismaClient()

async function update() {
  const html = fs.readFileSync('public/content/about-us.html', 'utf-8')

  const existing = await p.systemConfig.findFirst()
  if (!existing) {
    await p.systemConfig.create({
      data: {
        key: 'site_settings',
        value: 'system',
        aboutUs: html,
      }
    })
  } else {
    await p.systemConfig.update({
      where: { id: existing.id },
      data: { aboutUs: html }
    })
  }

  const updated = await p.systemConfig.findFirst({
    select: { aboutUs: true }
  })
  console.log('关于我们的内容已更新，长度:', updated.aboutUs?.length || 0, '字符')
  console.log('预览前 200 字符:', updated.aboutUs?.substring(0, 200))
}

update().catch(console.error).finally(() => p.$disconnect())
