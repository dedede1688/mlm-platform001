import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const prisma = new PrismaClient()

async function main() {
  console.log('===== site_settings 当前值 =====')
  const c = await prisma.systemConfig.findUnique({ where: { key: 'site_settings' } })
  if (!c) {
    console.log('!!! 没有 site_settings 记录 !!!')
  } else {
    console.log('siteName       :', JSON.stringify(c.siteName))
    console.log('logoUrl        :', c.logoUrl ? `[${c.logoUrl.length} chars]` : 'NULL')
    console.log('contactPhone   :', JSON.stringify(c.contactPhone))
    console.log('serviceEmail   :', JSON.stringify(c.serviceEmail))
    console.log('serviceTime    :', JSON.stringify(c.serviceTime))
    console.log('companyName    :', JSON.stringify(c.companyName))
    console.log('companyAddress :', JSON.stringify(c.companyAddress))
    console.log('icp            :', JSON.stringify(c.icp))
    console.log('copyright      :', JSON.stringify(c.copyright))
    console.log('updatedAt      :', c.updatedAt.toISOString())
  }
}

main().catch(e => { console.error('ERROR:', e?.message ?? e); process.exit(1) }).finally(() => prisma.$disconnect())