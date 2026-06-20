import { prisma } from '@/lib/prisma'
import { WITHDRAWAL_STATUS } from '@/lib/constants'

export class WithdrawalService {
  // 创建提现申请
  static async createWithdrawal(userId: string, amount: number) {
    if (amount <= 0) throw new Error('提现金额必须大于0')

    // 使用事务保证原子性：原子扣减余额 + 创建提现记录 + BalanceRecord 流水（v43-7 Batch 1）
    const withdrawal = await prisma.$transaction(async (tx) => {
      // 步骤1：查旧值（v43-7 统一规则：先查旧值，再用旧值+变动量计算新值）
      const before = await tx.user.findUnique({
        where: { id: userId },
        select: { balance: true, frozenBalance: true },
      })
      if (!before) throw new Error('用户不存在')
      if (before.balance < amount) throw new Error('余额不足')

      // 步骤2：原子扣减余额并增加冻结金额（防并发透支）
      const result = await tx.user.updateMany({
        where: {
          id: userId,
          balance: { gte: amount },
        },
        data: {
          balance: { decrement: amount },
          frozenBalance: { increment: amount },
        },
      })

      if (result.count === 0) {
        throw new Error('余额不足')
      }

      // 创建提现记录
      const wd = await tx.withdrawal.create({
        data: {
          userId,
          amount,
          status: WITHDRAWAL_STATUS.PENDING,
        },
      })

      // 步骤3：用旧值+变动量计算新值，写 BalanceRecord
      const newBalance = before.balance - amount
      const newFrozen = before.frozenBalance + amount
      await tx.balanceRecord.create({
        data: {
          userId,
          type: 'withdraw_freeze',
          amount: -amount,
          balance: newBalance,
          frozenBalance: newFrozen,
          sourceType: 'withdrawal',
          sourceId: wd.id,
          description: `提现申请冻结 ¥${amount}`,
        },
      })

      return wd
    })

    return withdrawal
  }

  // 审核提现（v43-7 Batch 1：BalanceRecord 流水）
  static async reviewWithdrawal(withdrawalId: string, approved: boolean, rejectReason?: string) {
    // 使用事务保证原子性
    return prisma.$transaction(async (tx) => {
      // 事务内查询并加锁检查状态
      const withdrawal = await tx.withdrawal.findUnique({
        where: { id: withdrawalId },
      })

      if (!withdrawal) throw new Error('提现记录不存在')
      if (withdrawal.status !== WITHDRAWAL_STATUS.PENDING) {
        throw new Error('提现记录已处理')
      }

      // 步骤1：查旧值（v43-7 统一规则）
      const before = await tx.user.findUnique({
        where: { id: withdrawal.userId },
        select: { balance: true, frozenBalance: true },
      })
      if (!before) throw new Error('用户不存在')

      if (approved) {
        // 通过：扣除冻结余额
        await tx.user.update({
          where: { id: withdrawal.userId },
          data: {
            frozenBalance: {
              decrement: withdrawal.amount,
            },
          },
        })

        // 步骤3：写 BalanceRecord（balance不变，frozenBalance减少）
        const newFrozen = before.frozenBalance - withdrawal.amount
        await tx.balanceRecord.create({
          data: {
            userId: withdrawal.userId,
            type: 'withdraw',
            amount: -withdrawal.amount,
            balance: before.balance,
            frozenBalance: newFrozen,
            sourceType: 'withdrawal',
            sourceId: withdrawal.id,
            description: `提现通过，扣减冻结 ¥${withdrawal.amount}`,
          },
        })

        return tx.withdrawal.update({
          where: { id: withdrawalId },
          data: {
            status: WITHDRAWAL_STATUS.APPROVED,
            reviewedAt: new Date(),
            paidAt: new Date(),
          },
        })
      } else {
        // 拒绝：解冻并退回余额
        await tx.user.update({
          where: { id: withdrawal.userId },
          data: {
            balance: {
              increment: withdrawal.amount,
            },
            frozenBalance: {
              decrement: withdrawal.amount,
            },
          },
        })

        // 步骤3：写 BalanceRecord（balance增加，frozenBalance减少）
        const newBalance = before.balance + withdrawal.amount
        const newFrozen = before.frozenBalance - withdrawal.amount
        await tx.balanceRecord.create({
          data: {
            userId: withdrawal.userId,
            type: 'unfreeze',
            amount: withdrawal.amount,
            balance: newBalance,
            frozenBalance: newFrozen,
            sourceType: 'withdrawal',
            sourceId: withdrawal.id,
            description: `提现拒绝，解冻退回 ¥${withdrawal.amount}`,
          },
        })

        return tx.withdrawal.update({
          where: { id: withdrawalId },
          data: {
            status: WITHDRAWAL_STATUS.REJECTED,
            rejectReason,
            reviewedAt: new Date(),
          },
        })
      }
    })
  }

  // 获取用户的提现记录
  static async getUserWithdrawals(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.withdrawal.count({
        where: { userId },
      }),
    ])

    return {
      withdrawals,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  // 获取待审核的提现列表
  static async getPendingWithdrawals(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal.findMany({
        where: { status: WITHDRAWAL_STATUS.PENDING },
        include: { user: true },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      prisma.withdrawal.count({
        where: { status: WITHDRAWAL_STATUS.PENDING },
      }),
    ])

    return {
      withdrawals,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  // 获取提现统计
  static async getWithdrawalStats() {
    const [pending, approved, rejected, totalAmount] = await Promise.all([
      prisma.withdrawal.count({
        where: { status: WITHDRAWAL_STATUS.PENDING },
      }),
      prisma.withdrawal.count({
        where: { status: WITHDRAWAL_STATUS.APPROVED },
      }),
      prisma.withdrawal.count({
        where: { status: WITHDRAWAL_STATUS.REJECTED },
      }),
      prisma.withdrawal.aggregate({
        where: { status: WITHDRAWAL_STATUS.APPROVED },
        _sum: { amount: true },
      }),
    ])

    return {
      pending,
      approved,
      rejected,
      totalAmount: totalAmount._sum.amount || 0,
    }
  }
}
