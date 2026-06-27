const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
;(async () => {
  const t = await p.notificationTemplate.findUnique({
    where: { type_channel: { type: 'order_paid', channel: 'in_app' } },
  })
  console.log('order_paid template:')
  console.log(JSON.stringify(t, null, 2))

  console.log('\n--- 所有模板 enabled 状态 ---')
  const all = await p.notificationTemplate.findMany({ where: { channel: 'in_app' } })
  for (const x of all) {
    console.log(`${x.type}: enabled=${x.enabled}, subject=${x.subject?.slice(0, 30) || '(null)'}`)
  }

  // 看 order.service.ts 里 payOrder 调用 IIFE 的上下文（行 200 附近）
  console.log('\n--- 看 payOrder 函数实际调用顺序 ---')
  const fs = require('fs')
  const src = fs.readFileSync('src/lib/services/order.service.ts', 'utf8')
  // 找 payOrder 函数体
  const m = src.match(/async payOrder\([^)]*\)\s*{[\s\S]*?(?=\n  async |\n})/g)
  if (m) console.log('payOrder function:')
  else console.log('payOrder not found, search IIFE pattern:')
  // 找所有 await (async()=>
  const lines = src.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('await (async()=>')) {
      console.log(`line ${i+1}: ${lines[i].slice(0, 200)}`)
    }
  }

  await p.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })