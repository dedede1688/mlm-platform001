/**
 * v68.12-verify 清理脚本
 * 用途：删掉造数脚本塞进去的测试退款/提现
 * 用法：npx tsx scripts/cleanup-test-amount-confirm.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('[cleanup] 开始清理 v68.12-verify 测试数据...')

  const refundResult = await prisma.refundRequest.deleteMany({
    where: { reason: { contains: 'v68.12-verify-测试大额退款' } },
  })
  console.log(`✅ 清理 RefundRequest: ${refundResult.count} 条`)

  const withdrawalResult = await prisma.withdrawal.deleteMany({
    where: { remark: { contains: 'v68.12-verify-测试大额提现' } },
  })
  console.log(`✅ 清理 Withdrawal: ${withdrawalResult.count} 条`)

  console.log('\n清理完成 ✅')
}

main()
  .catch((e) => {
    console.error('❌ 清理失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
