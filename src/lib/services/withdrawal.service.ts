import { prisma } from '@/lib/prisma'
import { WITHDRAWAL_STATUS } from '@/lib/constants'

export class WithdrawalService {
  // 创建提现申请
  static async createWithdrawal(userId: string, amount: number) {
    if (amount <= 0) throw new Error('提现金额必须大于0')

    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) throw new Error('用户不存在')
    if (user.balance < amount) throw new Error('余额不足')

    return await prisma.$transaction(async (tx) => {
      // 原子操作：余额扣减 + 冻结余额增加，防并发透支
      const result = await tx.user.updateMany({
        where: { id: userId, balance: { gte: amount } },
        data: {
          balance: { decrement: amount },
          frozenBalance: { increment: amount },
        },
      })
      if (result.count === 0) throw new Error('余额不足')

      // 创建提现记录
      const withdrawal = await tx.withdrawal.create({
        data: {
          userId,
          amount,
          status: WITHDRAWAL_STATUS.PENDING,
        },
      })

      // 写 BalanceRecord 流水
      await tx.balanceRecord.create({
        data: {
          userId,
          type: 'withdraw_freeze',
          amount: -amount,
          balance: user.balance - amount,
          frozenBalance: user.frozenBalance + amount,
          sourceType: 'withdrawal',
          sourceId: withdrawal.id,
          description: `提现申请冻结 ¥${amount}，提现 ID：${withdrawal.id}`,
        },
      })

      return withdrawal
    })
  }

  // 审核提现
  static async reviewWithdrawal(withdrawalId: string, approved: boolean, rejectReason?: string) {
    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id: withdrawalId },
    })

    if (!withdrawal) throw new Error('提现记录不存在')
    if (withdrawal.status !== WITHDRAWAL_STATUS.PENDING) {
      throw new Error('提现记录已处理')
    }

    if (approved) {
      return await prisma.$transaction(async (tx) => {
        // 查询用户当前余额（用于 BalanceRecord）
        const user = await tx.user.findUnique({
          where: { id: withdrawal.userId },
          select: { balance: true, frozenBalance: true },
        })
        if (!user) throw new Error('用户不存在')

        // 原子操作：冻结余额扣除，防并发
        const result = await tx.user.updateMany({
          where: { id: withdrawal.userId, frozenBalance: { gte: withdrawal.amount } },
          data: { frozenBalance: { decrement: withdrawal.amount } },
        })
        if (result.count === 0) throw new Error('冻结余额不足')

        const updatedWithdrawal = await tx.withdrawal.update({
          where: { id: withdrawalId },
          data: {
            status: WITHDRAWAL_STATUS.APPROVED,
            reviewedAt: new Date(),
            paidAt: new Date(),
          },
        })

        // 写 BalanceRecord 流水
        await tx.balanceRecord.create({
          data: {
            userId: withdrawal.userId,
            type: 'withdraw',
            amount: 0,
            balance: user.balance,
            frozenBalance: user.frozenBalance - withdrawal.amount,
            sourceType: 'withdrawal',
            sourceId: withdrawalId,
            description: `提现审核通过，扣除冻结余额 ¥${withdrawal.amount}，提现 ID：${withdrawalId}`,
          },
        })

        return updatedWithdrawal
      })
    } else {
      return await prisma.$transaction(async (tx) => {
        // 查询用户当前余额（用于 BalanceRecord）
        const user = await tx.user.findUnique({
          where: { id: withdrawal.userId },
          select: { balance: true, frozenBalance: true },
        })
        if (!user) throw new Error('用户不存在')

        // 原子操作：余额退回 + 冻结余额扣除，防并发
        const result = await tx.user.updateMany({
          where: { id: withdrawal.userId, frozenBalance: { gte: withdrawal.amount } },
          data: {
            balance: { increment: withdrawal.amount },
            frozenBalance: { decrement: withdrawal.amount },
          },
        })
        if (result.count === 0) throw new Error('冻结余额不足')

        const updatedWithdrawal = await tx.withdrawal.update({
          where: { id: withdrawalId },
          data: {
            status: WITHDRAWAL_STATUS.REJECTED,
            rejectReason,
            reviewedAt: new Date(),
          },
        })

        // 写 BalanceRecord 流水
        await tx.balanceRecord.create({
          data: {
            userId: withdrawal.userId,
            type: 'unfreeze',
            amount: withdrawal.amount,
            balance: user.balance + withdrawal.amount,
            frozenBalance: user.frozenBalance - withdrawal.amount,
            sourceType: 'withdrawal',
            sourceId: withdrawalId,
            description: `提现审核拒绝，退回余额 ¥${withdrawal.amount}，原因：${rejectReason || '无'}，提现 ID：${withdrawalId}`,
          },
        })

        return updatedWithdrawal
      })
    }
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
