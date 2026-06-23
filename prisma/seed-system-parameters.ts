import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const SYSTEM_PARAMETERS = [
  { key: 'auto_confirm_days', defaultValue: 7, description: '自动确认收货时间（发货后多久自动完成）' },
  { key: 'earnings_hold_hours', defaultValue: 24, description: '收益到账缓冲期（确认收货后多久可提现）' },
  { key: 'refund_window_days', defaultValue: 7, description: '可申请退款时间窗口（发货后多久内可退款）' },
  { key: 'dividend_period_minutes', defaultValue: 1440, description: '分红结算周期（订单入池后多久结算）' },
]

async function main() {
  for (const def of SYSTEM_PARAMETERS) {
    await prisma.systemConfig.upsert({
      where: { key: def.key },
      create: { key: def.key, value: String(def.defaultValue), description: def.description },
      update: { description: def.description },
    })
    console.log(`✅ ${def.key} = ${def.defaultValue}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
