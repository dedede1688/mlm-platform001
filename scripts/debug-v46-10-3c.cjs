const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
;(async () => {
  // 直接模拟 order.service.ts line 202 的 batch.create
  const userId = '1490ac44-c967-4110-ae53-321b3e6e13f8'
  const orderNo = 'TEST-V46-10-3'

  try {
    console.log('--- 测试 batch.create type=business ---')
    const b = await p.notificationBatch.create({
      data: {
        type: 'business',
        title: '订单支付通知',
        content: '订单 ' + orderNo + ' 已支付',
        templateType: 'order_paid',
        recipientCount: 1,
        senderId: null,
      },
    })
    console.log('✅ batch created:', b.id)

    console.log('--- 测试 sendInApp ---')
    const { sendInApp } = require('./src/lib/notification/sendInApp.ts')
    // 注意 sendInApp 是 TS，require 不会直接 work
  } catch (e) {
    console.log('❌ batch.create FAILED:', e.message)
    console.log('code:', e.code)
    console.log('meta:', JSON.stringify(e.meta, null, 2))
  }

  await p.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })