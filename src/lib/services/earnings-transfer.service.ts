import { prisma } from '@/lib/prisma'
import { BALANCE_RECORD_TYPE, BALANCE_SELECT } from '@/lib/constants'

/**
 * 收益转余额服务（第 1 包：后端基础能力）
 *
 * 业务规则：
 * - 用户把 earningsAvailable（可用收益）转入 balance（购物余额）
 * - balance 不能转回 earningsAvailable（单向）
 * - 使用 updateMany 防并发扣减
 * - 事务保证原子性
 * - 通知和操作日志在 route 层做，不放进 service 事务里
 */
export class EarningsTransferService {
  /**
   * 收益转余额
   *
   * @param userId 用户 ID
   * @param amount 转入金额（必须 > 0，不能超过 earningsAvailable）
   * @returns 转入后的用户余额信息
   */
  static async transferToBalance(
    userId: string,
    amount: number
  ): Promise<{
    userId: string
    amount: number
    balance: number
    earningsAvailable: number
  }> {
    // 1. 校验 amount
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new Error('转入金额必须为有效数字且大于0')
    }

    // 2. 查询用户当前资金
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        ...BALANCE_SELECT,
      },
    })

    // 3. 用户不存在
    if (!user) {
      throw new Error('用户不存在')
    }

    // 4. 可用收益不足
    if (user.earningsAvailable < amount) {
      throw new Error('可用收益不足')
    }

    // 5. 使用 updateMany 防并发扣减
    return await prisma.$transaction(async (tx) => {
      const result = await tx.user.updateMany({
        where: {
          id: userId,
          earningsAvailable: { gte: amount },
        },
        data: {
          earningsAvailable: { decrement: amount },
          balance: { increment: amount },
        },
      })

      // 6. updateMany count = 0 说明并发时可用收益已被扣减
      if (result.count === 0) {
        throw new Error('可用收益不足或状态已变更')
      }

      // 7. 重新查询用户最新余额
      const updatedUser = await tx.user.findUnique({
        where: { id: userId },
        select: {
          balance: true,
          frozenBalance: true,
          earningsAvailable: true,
        },
      })

      if (!updatedUser) {
        throw new Error('用户不存在')
      }

      // 8. 写 BalanceRecord
      await tx.balanceRecord.create({
        data: {
          userId,
          type: BALANCE_RECORD_TYPE.EARNINGS_TO_BALANCE,
          amount,
          balance: updatedUser.balance,
          frozenBalance: updatedUser.frozenBalance,
          sourceType: 'earnings_transfer',
          sourceId: userId,
          description: `收益转入购物余额 ¥${amount.toFixed(2)}`,
        },
      })

      return {
        userId,
        amount,
        balance: updatedUser.balance,
        earningsAvailable: updatedUser.earningsAvailable,
      }
    })
  }
}
