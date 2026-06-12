const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const p = new PrismaClient()

async function update() {
  const html = fs.readFileSync('public/content/terms.html', 'utf-8')

  const existing = await p.systemConfig.findFirst()
  if (!existing) {
    await p.systemConfig.create({
      data: { key: 'site_settings', value: 'system', termsHtml: html }
    })
  } else {
    await p.systemConfig.update({
      where: { id: existing.id },
      data: { termsHtml: html }
    })
  }

  const updated = await p.systemConfig.findFirst({ select: { termsHtml: true } })
  console.log('用户协议内容已更新，长度:', updated.termsHtml?.length || 0, '字符')
}

update().catch(console.error).finally(() => p.$disconnect())
