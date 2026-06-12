const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function check() {
  const c = await p.systemConfig.findFirst({
    select: { aboutUs: true, termsHtml: true, privacyHtml: true }
  })
  console.log('aboutUs 长度:', c.aboutUs?.length || 0)
  console.log('termsHtml 长度:', c.termsHtml?.length || 0)
  console.log('privacyHtml 长度:', c.privacyHtml?.length || 0)
  console.log('termsHtml 预览:', c.termsHtml?.substring(0, 100))
}

check().catch(console.error).finally(() => p.$disconnect())
