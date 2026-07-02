/**
 * v68.12-verify 造数脚本
 * 用途：造一笔 ≥1000 的待审退款 + 一笔 ≥5000 的待审提现，用于大额二次确认弹框验证
 * 用法：npx tsx scripts/seed-test-amount-confirm.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('[v68.12-verify] 开始造数据...')

  // 找一个测试用户（胡子哥常用 13800138888）
  const testUser = await prisma.user.findFirst({
    where: { phone: '13800138888' },
  })

  if (!testUser) {
    console.error('❌ 找不到测试用户 13800138888，请先用该手机号注册或手动指定一个 userId')
    process.exit(1)
  }
  console.log(`[v68.12-verify] 找到测试用户: ${testUser.id} (${testUser.phone})`)

  // 找一个该用户的订单（任意状态都 OK，因为 schema 不要求 status=specific）
  // 优先 paid，没有就 pending 也行
  let paidOrder = await prisma.order.findFirst({
    where: { userId: testUser.id, status: { in: ['paid', 'shipped', 'completed'] } },
  })

  if (!paidOrder) {
    paidOrder = await prisma.order.findFirst({
      where: { userId: testUser.id },
    })
  }

  if (!paidOrder) {
    // 实在没有就借用别人的订单（这是测试数据，不影响原订单）
    paidOrder = await prisma.order.findFirst()
  }

  if (!paidOrder) {
    console.error(`❌ 数据库里完全没订单，请先下一单`)
    process.exit(1)
  }
  console.log(`[v68.12-verify] 找到订单: ${paidOrder.id} (status=${paidOrder.status}, orderNo=${paidOrder.orderNo})`)

  // 清理已有的"测试大额"残留数据（防止重复造）
  await prisma.refundRequest.deleteMany({
    where: { reason: { contains: 'v68.12-verify-测试大额退款' } },
  })
  await prisma.withdrawal.deleteMany({
    where: { remark: { contains: 'v68.12-verify-测试大额提现' } },
  })

  // 1) 造一笔 amount=5000 的待审退款（≥1000 触发大额弹框）
  const refund = await prisma.refundRequest.create({
    data: {
      orderId: paidOrder.id,
      userId: testUser.id,
      amount: 5000,
      reason: 'v68.12-verify-测试大额退款 - ¥5000 触发红色二次确认弹框',
      status: 'pending',
    },
  })
  console.log(`✅ RefundRequest created: ${refund.id} (¥${refund.amount})`)

  // 2) 造一笔 amount=8000 的待审提现（≥5000 触发大额弹框）
  const withdrawal = await prisma.withdrawal.create({
    data: {
      userId: testUser.id,
      amount: 8000,
      status: 'pending',
      paymentMethod: 'bank',
      accountNumber: '6222021234567890123',
      accountName: '胡子哥',
      bankName: '中国工商银行',
      remark: 'v68.12-verify-测试大额提现 - ¥8000 触发红色二次确认弹框',
    },
  })
  console.log(`✅ Withdrawal created: ${withdrawal.id} (¥${withdrawal.amount})`)

  console.log('\n========================================')
  console.log('造数据完成 ✅')
  console.log('========================================')
  console.log(`退款 ID:  ${refund.id}`)
  console.log(`提现 ID:  ${withdrawal.id}`)
  console.log(`用户:     ${testUser.phone}`)
  console.log('========================================')
  console.log('\n下一步: 胡子哥登录后台 → 退款审核 / 提现审核 → 点"通过" → 应该弹红色大额确认弹框')
  console.log('验证完跑清理: npx tsx scripts/cleanup-test-amount-confirm.ts')
}

main()
  .catch((e) => {
    console.error('❌ 造数据失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
