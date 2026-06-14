import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'

// Load .env.local
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const prisma = new PrismaClient()

async function main() {
  const rows = await prisma.systemConfig.findMany()
  console.log('Total rows:', rows.length)
  if (rows.length === 0) {
    console.log('!!! system_configs 表里没有任何记录 !!!')
  } else {
    for (const r of rows) {
      console.log('---')
      console.log('id        :', r.id)
      console.log('key       :', r.key)
      console.log('value     :', r.value)
      console.log('siteName  :', r.siteName)
      console.log('companyName:', r.companyName)
      console.log('companyAddress:', r.companyAddress)
      console.log('contactPhone:', r.contactPhone)
      console.log('serviceEmail:', r.serviceEmail)
      console.log('serviceTime :', r.serviceTime)
      console.log('icp       :', r.icp)
      console.log('copyright :', r.copyright)
      console.log('logoUrl   :', r.logoUrl)
      console.log('updatedAt :', r.updatedAt)
    }
  }
}

main().catch(e => { console.error('ERROR:', e?.message ?? e); process.exit(1) }).finally(() => prisma.$disconnect())