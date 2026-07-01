// v46.12: seed refund_review + refund_completed 模板
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
;(async () => {
  const templates = [
    {
      type: 'refund_review',
      channel: 'in_app',
      subject: '退款审核{{result}}通知',
      content:
        '【敏维科技】您的退款申请已{{result}}{{refundReason}}。\n退款编号：{{refundId}}\n如有疑问请联系客服。',
    },
    {
      type: 'refund_completed',
      channel: 'in_app',
      subject: '退款完成通知',
      content:
        '【敏维科技】您的订单退款已完成，金额 ¥{{amount}} 已退回您的账户余额。\n订单号：{{orderNo}}\n如有疑问请联系客服。',
    },
  ]
  for (const t of templates) {
    const existing = await p.notificationTemplate.findUnique({
      where: { type_channel: { type: t.type, channel: t.channel } },
    })
    if (existing) {
      console.log(`update existing template: ${t.type}`)
      await p.notificationTemplate.update({
        where: { type_channel: { type: t.type, channel: t.channel } },
        data: { subject: t.subject, content: t.content, enabled: true },
      })
    } else {
      console.log(`create new template: ${t.type}`)
      await p.notificationTemplate.create({ data: t })
    }
  }
  await p.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })