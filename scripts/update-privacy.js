const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const p = new PrismaClient()

async function update() {
  const html = fs.readFileSync('public/content/privacy.html', 'utf-8')
  const existing = await p.systemConfig.findFirst()
  if (!existing) {
    await p.systemConfig.create({ data: { key: 'site_settings', value: 'system', privacyHtml: html } })
  } else {
    await p.systemConfig.update({ where: { id: existing.id }, data: { privacyHtml: html } })
  }
  const updated = await p.systemConfig.findFirst({ select: { privacyHtml: true } })
  console.log('隐私政策已更新，长度:', updated.privacyHtml?.length || 0, '字符')
}

update().catch(console.error).finally(() => p.$disconnect())
