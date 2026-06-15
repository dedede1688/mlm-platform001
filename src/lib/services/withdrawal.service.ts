import { prisma } from '@/lib/prisma'
import { WITHDRAWAL_STATUS } from '@/lib/constants'

export class WithdrawalService {
  // 创建提现申请
  static async createWithdrawal(userId: string, amount: number) {
    if (amount <= 0) throw new Error('提现金额必须大于0')

    // 使用事务保证原子性：原子扣减余额 + 创建提现记录
    const withdrawal = await prisma.$transaction(async (tx) => {
      // 原子扣减余额并增加冻结金额（防并发透支）
      const result = await tx.$queryRawUnsafe<{ count: number }[]>(`
        UPDATE "users"
        SET balance = balance - ${amount},
            "frozen_balance" = "frozen_balance" + ${amount}
        WHERE id = '${userId.replace(/'/g, "''")}'::uuid AND balance >= ${amount}
        RETURNING 1 as count
      `)
      
      if (result.length === 0) {
        throw new Error('余额不足')
      }

      // 创建提现记录
      return tx.withdrawal.create({
        data: {
          userId,
          amount,
          status: WITHDRAWAL_STATUS.PENDING,
        },
      })
    })

    return withdrawal
  }

  // 审核提现
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

      if (approved) {
        // 通过：解冻并扣除
        await tx.user.update({
          where: { id: withdrawal.userId },
          data: {
            frozenBalance: {
              decrement: withdrawal.amount,
            },
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
