import { prisma } from '@/lib/prisma'
import { WITHDRAWAL_STATUS } from '@/lib/constants'
import { getBusinessConfig } from '@/lib/config/business'
import { WithdrawalAuditLogService } from './withdrawal-audit-log.service'
import { NotificationService } from './notification.service'

export interface CreateWithdrawalParams {
  amount: number
  paymentMethod: string
  accountNumber: string
  accountName: string
  bankName?: string
  paymentPassword: string
}

export interface ReviewWithdrawalParams {
  approved: boolean
  reviewedBy?: string
  rejectReason?: string
  rejectTemplateId?: string
  remark?: string
}

export class WithdrawalService {
  static async createWithdrawal(userId: string, params: CreateWithdrawalParams) {
    const { amount, paymentMethod, accountNumber, accountName, bankName } = params

    if (amount <= 0) throw new Error('提现金额必须大于0')

    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) throw new Error('用户不存在')

    if (!user.paymentPasswordHash) throw new Error('请先设置支付密码')
    if (user.balance < amount) throw new Error('余额不足')

    const minAmount = await getBusinessConfig('withdrawal.min_amount', 100)
    const maxAmount = await getBusinessConfig('withdrawal.max_amount', 50000)
    const dailyLimit = await getBusinessConfig('withdrawal.daily_limit', 3)

    if (amount < minAmount) throw new Error(`最低提现金额 ¥${minAmount}`)
    if (amount > maxAmount) throw new Error(`单笔最高提现金额 ¥${maxAmount}`)

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const todayCount = await prisma.withdrawal.count({
      where: {
        userId,
        createdAt: { gte: todayStart },
      },
    })
    if (todayCount >= dailyLimit) throw new Error(`每日最多提现 ${dailyLimit} 次`)

    if (!paymentMethod) throw new Error('请选择收款方式')
    if (!accountNumber) throw new Error('请输入收款账号')
    if (!accountName) throw new Error('请输入收款人姓名')

    return await prisma.$transaction(async (tx) => {
      const result = await tx.user.updateMany({
        where: { id: userId, balance: { gte: amount } },
        data: {
          balance: { decrement: amount },
          frozenBalance: { increment: amount },
        },
      })
      if (result.count === 0) throw new Error('余额不足')

      const withdrawal = await tx.withdrawal.create({
        data: {
          userId,
          amount,
          status: WITHDRAWAL_STATUS.PENDING,
          paymentMethod,
          accountNumber,
          accountName,
          bankName: bankName || null,
        },
      })

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

  static async reviewWithdrawal(withdrawalId: string, params: ReviewWithdrawalParams) {
    const { approved, reviewedBy, rejectReason, rejectTemplateId, remark } = params
    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id: withdrawalId },
    })

    if (!withdrawal) throw new Error('提现记录不存在')
    if (withdrawal.status !== WITHDRAWAL_STATUS.PENDING) {
      throw new Error('提现记录已处理')
    }

    if (approved) {
      return await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: withdrawal.userId },
          select: { balance: true, frozenBalance: true },
        })
        if (!user) throw new Error('用户不存在')

        const result = await tx.user.updateMany({
          where: { id: withdrawal.userId, frozenBalance: { gte: withdrawal.amount } },
          data: { frozenBalance: { decrement: withdrawal.amount } },
        })
        if (result.count === 0) throw new Error('冻结余额不足')

        const updatedWithdrawal = await tx.withdrawal.update({
          where: { id: withdrawalId },
          data: {
            status: WITHDRAWAL_STATUS.APPROVED,
            reviewedBy: reviewedBy || null,
            reviewedAt: new Date(),
            paidAt: new Date(),
            remark: remark || null,
          },
        })

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

        await WithdrawalAuditLogService.logReview({
          withdrawalId,
          action: 'approve',
          oldStatus: WITHDRAWAL_STATUS.PENDING,
          newStatus: WITHDRAWAL_STATUS.APPROVED,
          operatorId: reviewedBy,
          remark,
        })

        await NotificationService.sendWithdrawalNotification({
          userId: withdrawal.userId,
          type: 'withdrawal_approved',
          withdrawalId,
          amount: withdrawal.amount,
        })

        return updatedWithdrawal
      })
    } else {
      return await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: withdrawal.userId },
          select: { balance: true, frozenBalance: true },
        })
        if (!user) throw new Error('用户不存在')

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
            reviewedBy: reviewedBy || null,
            rejectReason,
            rejectTemplateId: rejectTemplateId || null,
            remark: remark || null,
            reviewedAt: new Date(),
          },
        })

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

        await WithdrawalAuditLogService.logReview({
          withdrawalId,
          action: 'reject',
          oldStatus: WITHDRAWAL_STATUS.PENDING,
          newStatus: WITHDRAWAL_STATUS.REJECTED,
          operatorId: reviewedBy,
          reason: rejectReason,
          remark,
        })

        await NotificationService.sendWithdrawalNotification({
          userId: withdrawal.userId,
          type: 'withdrawal_rejected',
          withdrawalId,
          amount: withdrawal.amount,
          rejectReason,
        })

        return updatedWithdrawal
      })
    }
  }

  static async batchReview(withdrawalIds: string[], params: ReviewWithdrawalParams) {
    const results = { success: 0, failed: 0, errors: [] as { id: string; error: string }[] }

    for (const id of withdrawalIds) {
      try {
        await this.reviewWithdrawal(id, params)
        results.success++
      } catch (e: any) {
        results.failed++
        results.errors.push({ id, error: e.message || '未知错误' })
      }
    }

    return results
  }

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
