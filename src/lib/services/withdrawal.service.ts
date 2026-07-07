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

export interface CompleteWithdrawalParams {
  completedBy: string
  paymentProofUrl: string
  remark?: string
}

export class WithdrawalService {
  /**
   * 创建提现申请
   * 资金底座第 2 包：提现只能从 earningsAvailable 发起
   * - earningsAvailable 减少
   * - earningsFrozen 增加
   * - status = pending
   * - balance 全程不变
   */
  static async createWithdrawal(userId: string, params: CreateWithdrawalParams) {
    const { amount, paymentMethod, accountNumber, accountName, bankName } = params

    if (amount <= 0) throw new Error('提现金额必须大于0')

    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) throw new Error('用户不存在')

    if (!user.paymentPasswordHash) throw new Error('请先设置支付密码')
    if (user.earningsAvailable < amount) throw new Error('可提现收益不足')

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
      // 原子扣减 earningsAvailable，增加 earningsFrozen
      const result = await tx.user.updateMany({
        where: { id: userId, earningsAvailable: { gte: amount } },
        data: {
          earningsAvailable: { decrement: amount },
          earningsFrozen: { increment: amount },
        },
      })
      if (result.count === 0) throw new Error('可提现收益不足')

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

      // 写 BalanceRecord：balance 保持不变，frozenBalance 保持不变
      await tx.balanceRecord.create({
        data: {
          userId,
          type: 'withdraw_freeze',
          amount: -amount,
          balance: user.balance,
          frozenBalance: user.frozenBalance,
          sourceType: 'withdrawal',
          sourceId: withdrawal.id,
          description: `提现申请冻结收益，可提现收益 -¥${amount}，冻结收益 +¥${amount}，提现 ID：${withdrawal.id}`,
        },
      })

      return withdrawal
    })
  }

  /**
   * 审核提现
   * approve: pending → approved（只改状态，不扣 earningsFrozen，不写 paidAt）
   * reject: pending → rejected（退回 earningsFrozen 到 earningsAvailable）
   * balance 全程不变
   */
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
      // 审核通过：只改状态，不扣 earningsFrozen，不写 paidAt
      return await prisma.$transaction(async (tx) => {
        const updatedWithdrawal = await tx.withdrawal.update({
          where: { id: withdrawalId },
          data: {
            status: WITHDRAWAL_STATUS.APPROVED,
            reviewedBy: reviewedBy || null,
            reviewedAt: new Date(),
            remark: remark || null,
          },
        })

        // P1 修复：approve 不写 BalanceRecord，审核动作由 WithdrawalAuditLog 和 OperationLog 记录
        // 真正资金变化只在：创建提现、拒绝提现、完成打款

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
      // 审核拒绝：退回 earningsFrozen 到 earningsAvailable
      return await prisma.$transaction(async (tx) => {
        const result = await tx.user.updateMany({
          where: { id: withdrawal.userId, earningsFrozen: { gte: withdrawal.amount } },
          data: {
            earningsFrozen: { decrement: withdrawal.amount },
            earningsAvailable: { increment: withdrawal.amount },
          },
        })
        if (result.count === 0) throw new Error('冻结收益不足')

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

        // 写 BalanceRecord：balance 不变
        const user = await tx.user.findUnique({
          where: { id: withdrawal.userId },
          select: { balance: true, frozenBalance: true },
        })

        await tx.balanceRecord.create({
          data: {
            userId: withdrawal.userId,
            type: 'unfreeze',
            amount: withdrawal.amount,
            balance: user?.balance ?? 0,
            frozenBalance: user?.frozenBalance ?? 0,
            sourceType: 'withdrawal',
            sourceId: withdrawalId,
            description: `提现审核拒绝，冻结收益退回可提现收益 ¥${withdrawal.amount}，原因：${rejectReason || '无'}，提现 ID：${withdrawalId}`,
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

  /**
   * 完成提现打款（财务线下打款后调用）
   * approved → completed
   * - paymentProofUrl 必填
   * - earningsFrozen 减少
   * - 写 paidAt / completedAt / completedBy / paymentProofUrl
   * - balance 全程不变
   */
  static async completeWithdrawal(withdrawalId: string, params: CompleteWithdrawalParams) {
    const { completedBy, paymentProofUrl, remark } = params

    if (!paymentProofUrl || !paymentProofUrl.trim()) {
      throw new Error('打款凭证不能为空')
    }

    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id: withdrawalId },
    })

    if (!withdrawal) throw new Error('提现记录不存在')
    if (withdrawal.status !== WITHDRAWAL_STATUS.APPROVED) {
      throw new Error('只有已审核通过的提现才能完成打款')
    }

    return await prisma.$transaction(async (tx) => {
      // 原子扣减 earningsFrozen
      const result = await tx.user.updateMany({
        where: { id: withdrawal.userId, earningsFrozen: { gte: withdrawal.amount } },
        data: {
          earningsFrozen: { decrement: withdrawal.amount },
        },
      })
      if (result.count === 0) throw new Error('冻结收益不足，无法完成打款')

      const now = new Date()
      const updatedWithdrawal = await tx.withdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: WITHDRAWAL_STATUS.COMPLETED,
          paidAt: now,
          completedAt: now,
          completedBy,
          paymentProofUrl: paymentProofUrl.trim(),
          remark: remark || null,
        },
      })

      // 写 BalanceRecord：balance 不变
      const user = await tx.user.findUnique({
        where: { id: withdrawal.userId },
        select: { balance: true, frozenBalance: true },
      })

      await tx.balanceRecord.create({
        data: {
          userId: withdrawal.userId,
          type: 'withdraw',
          amount: -withdrawal.amount,
          balance: user?.balance ?? 0,
          frozenBalance: user?.frozenBalance ?? 0,
          sourceType: 'withdrawal',
          sourceId: withdrawalId,
          description: `提现打款完成，冻结收益扣除 ¥${withdrawal.amount}，提现 ID：${withdrawalId}，凭证：${paymentProofUrl.trim()}`,
        },
      })

      await WithdrawalAuditLogService.logReview({
        withdrawalId,
        action: 'complete',
        oldStatus: WITHDRAWAL_STATUS.APPROVED,
        newStatus: WITHDRAWAL_STATUS.COMPLETED,
        operatorId: completedBy,
        remark,
      })

      await NotificationService.sendWithdrawalNotification({
        userId: withdrawal.userId,
        type: 'withdrawal_completed',
        withdrawalId,
        amount: withdrawal.amount,
        paymentProofUrl: paymentProofUrl.trim(),
      })

      return updatedWithdrawal
    })
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
    const [pending, approved, rejected, completed, totalAmount] = await Promise.all([
      prisma.withdrawal.count({
        where: { status: WITHDRAWAL_STATUS.PENDING },
      }),
      prisma.withdrawal.count({
        where: { status: WITHDRAWAL_STATUS.APPROVED },
      }),
      prisma.withdrawal.count({
        where: { status: WITHDRAWAL_STATUS.REJECTED },
      }),
      prisma.withdrawal.count({
        where: { status: WITHDRAWAL_STATUS.COMPLETED },
      }),
      prisma.withdrawal.aggregate({
        where: { status: WITHDRAWAL_STATUS.COMPLETED },
        _sum: { amount: true },
      }),
    ])

    return {
      pending,
      approved,
      rejected,
      completed,
      totalAmount: totalAmount._sum.amount || 0,
    }
  }
}
