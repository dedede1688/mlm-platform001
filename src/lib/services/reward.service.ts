import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { UserService } from './user.service'
import { BALANCE_SELECT } from '@/lib/constants'
import { getBusinessConfig } from '@/lib/config/business'
import { logger } from '@/lib/logger'
import { RewardCalculationService, type RewardProcessOutcome } from './reward-calculation.service'
import { format4FieldDelta } from '@/lib/utils/balance-record-desc'

/**
 * v50 N-2 / Batch 11: reward service (split)
 *
 * Retained methods (4):
 * - processOrderRewards (entry + upgrade check)
 * - checkUpgradeFromOrder (upgrade check)
 * - getUserRewardStats (stats query)
 * - processRefund (refund clawback)
 *
 * Extracted:
 * - reward-calculation.service.ts: processPaidOrderRewards (reward calc engine, ~380 lines)
 */

export class RewardService {
  /** Passthrough to RewardCalculationService for backward compat */
  static async processPaidOrderRewards(orderId: string): Promise<RewardProcessOutcome> {
    return RewardCalculationService.processPaidOrderRewards(orderId)
  }

  static async processOrderRewards(orderId: string): Promise<{ referralUnlockRequired?: boolean; referralUnlockAmount?: number }> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { user: { select: { id: true, referrerId: true } }, items: { include: { product: true } } },
    })

    if (!order || order.status !== 'paid') return {}

    const buyer = order.user

    let referralUnlockRequired = false
    let referralUnlockAmount: number | undefined

    if (buyer.referrerId) {
      const referrer = await prisma.user.findUnique({
        where: { id: buyer.referrerId },
        select: { upgradeProductCount: true },
      })
      if (referrer && referrer.upgradeProductCount < 1) {
        const rate = await getBusinessConfig<number>('reward.referral_rate', 0.20)
        referralUnlockRequired = true
        referralUnlockAmount = order.payAmount * rate
      }
    }

    const result = await RewardCalculationService.processPaidOrderRewards(orderId)

    if (result.status === 'completed') {
      await this.checkUpgradeFromOrder(buyer.id, order)
    }

    if (referralUnlockRequired) {
      return { referralUnlockRequired: true, referralUnlockAmount }
    }

    return {}
  }

  static async checkUpgradeFromOrder(userId: string, order: { id: string; items: Array<{ product: { isUpgradeProduct: boolean }; quantity: number }>; payAmount: number }) {
    const hasUpgradeProduct = order.items.some(
      (item) => item.product.isUpgradeProduct
    )

    await UserService.addDirectSales(userId, order.payAmount)

    if (hasUpgradeProduct) {
      await UserService.addUpgradeProductCount(userId,
        order.items
          .filter((item) => item.product.isUpgradeProduct)
          .reduce((sum, item) => sum + item.quantity, 0)
      )

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { referrerId: true },
      })

      if (user?.referrerId) {
        await UserService.addDirectSales(user.referrerId, order.payAmount)
      }

      await UserService.checkAndUpgradeLevel(userId, order.id)

      if (user?.referrerId) {
        await UserService.checkAndUpgradeLevel(user.referrerId, order.id)
      }
    } else {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { referrerId: true },
      })

      if (user?.referrerId) {
        await UserService.addDirectSales(user.referrerId, order.payAmount)
        await UserService.checkAndUpgradeLevel(user.referrerId, order.id)
      }
    }
  }

  static async getUserRewardStats(userId: string) {
    const [rewards, dividends] = await Promise.all([
      prisma.reward.findMany({
        where: { userId },
      }),
      prisma.dividend.findMany({
        where: { userId },
      }),
    ])

    const paidRewards = rewards.filter(r => r.status === 'paid')

    const referralTotal = paidRewards
      .filter(r => r.type === 'referral')
      .reduce((sum, r) => sum + r.amount, 0)

    const brandBonusTotal = paidRewards
      .filter(r => r.type === 'brand_bonus')
      .reduce((sum, r) => sum + r.amount, 0)

    const dividendTotal = dividends.reduce((sum, d) => sum + d.amount, 0)

    const totalAmount = referralTotal + brandBonusTotal + dividendTotal

    return {
      totalAmount,
      referralTotal,
      brandBonusTotal,
      dividendTotal,
      totalCount: paidRewards.length + dividends.length,
    }
  }

  static async processRefund(orderId: string, outerTx?: Prisma.TransactionClient) {
    const execute = async (tx: Prisma.TransactionClient) => {
      const rewards = await tx.reward.findMany({
        where: { orderId, status: 'paid' },
      })

      const dividends = await tx.dividend.findMany({
        where: { orderId, refundedAt: null },
      })

      if (rewards.length === 0 && dividends.length === 0) return

      const refundTime = new Date()

      if (rewards.length > 0) {
        const rewardClaimed = await tx.reward.updateMany({
          where: { id: { in: rewards.map(r => r.id) }, status: 'paid' },
          data: { status: 'refunded' },
        })

        if (rewardClaimed.count !== rewards.length) {
          throw new Error(`退款抢占不完整：预期 ${rewards.length} 条 Reward，实际抢占 ${rewardClaimed.count} 条`)
        }

        const rewardUserIds = [...new Set(rewards.map(r => r.userId))]
        const rewardUsersMap = new Map<string, { id: string; balance: number; frozenBalance: number; consumeBalance: number; earningsAvailable: number; earningsPending: number; earningsVoided: number; earningsFrozen: number }>()
        if (rewardUserIds.length > 0) {
          const users = await tx.user.findMany({
            where: { id: { in: rewardUserIds } },
            select: { id: true, ...BALANCE_SELECT },
          })
          for (const u of users) rewardUsersMap.set(u.id, u)
        }

        const rewardBalanceRecords: Array<{ userId: string; type: string; amount: number; balance: number; frozenBalance: number; sourceType: string; sourceId: string; description: string }> = []

        for (const reward of rewards) {
          const user = rewardUsersMap.get(reward.userId)
          if (!user) throw new Error(`用户 ${reward.userId} 不存在`)

          const deductFromAvailable = Math.min(user.earningsAvailable, reward.amount)
          const voidedAmount = reward.amount - deductFromAvailable

          const afterRefundReward = {
            consumeBalance: user.consumeBalance,
            earningsAvailable: user.earningsAvailable - deductFromAvailable,
            earningsPending: user.earningsPending,
            earningsVoided: user.earningsVoided + voidedAmount,
          }

          const updateData: Record<string, { decrement?: number; increment?: number }> = {
            earningsAvailable: { decrement: deductFromAvailable },
          }
          if (voidedAmount > 0) {
            updateData.earningsVoided = { increment: voidedAmount }
          }
          await tx.user.update({
            where: { id: reward.userId },
            data: updateData,
          })

          const voidDesc = voidedAmount > 0
            ? `，其中可提现收益扣减 ¥${deductFromAvailable.toFixed(2)}，作废收益 ¥${voidedAmount.toFixed(2)}`
            : `，可提现收益扣减 ¥${reward.amount.toFixed(2)}`
          rewardBalanceRecords.push({
            userId: reward.userId,
            type: 'refund_reward',
            amount: -reward.amount,
            balance: user.balance,
            frozenBalance: user.frozenBalance,
            sourceType: 'reward',
            sourceId: reward.id,
            description: `扣回奖励（${reward.type}），余额不变${voidDesc}，订单退款${format4FieldDelta(user, afterRefundReward)}`,
          })
        }

        if (rewardBalanceRecords.length > 0) {
          await tx.balanceRecord.createMany({ data: rewardBalanceRecords })
        }
      }

      if (dividends.length > 0) {
        const dividendClaimed = await tx.dividend.updateMany({
          where: { id: { in: dividends.map(d => d.id) }, refundedAt: null },
          data: { refundedAt: refundTime },
        })

        if (dividendClaimed.count !== dividends.length) {
          throw new Error(`退款抢占不完整：预期 ${dividends.length} 条 Dividend，实际抢占 ${dividendClaimed.count} 条`)
        }

        const dividendUserIds = [...new Set(dividends.map(d => d.userId))]
        const dividendUsersMap = new Map<string, { id: string; balance: number; frozenBalance: number; consumeBalance: number; earningsAvailable: number; earningsPending: number; earningsVoided: number; earningsFrozen: number }>()
        if (dividendUserIds.length > 0) {
          const users = await tx.user.findMany({
            where: { id: { in: dividendUserIds } },
            select: { id: true, ...BALANCE_SELECT },
          })
          for (const u of users) dividendUsersMap.set(u.id, u)
        }

        const dividendBalanceRecords: Array<{ userId: string; type: string; amount: number; balance: number; frozenBalance: number; sourceType: string; sourceId: string; description: string }> = []

        for (const dividend of dividends) {
          const user = dividendUsersMap.get(dividend.userId)
          if (!user) throw new Error(`用户 ${dividend.userId} 不存在`)

          const deductFromAvailableDiv = Math.min(user.earningsAvailable, dividend.amount)
          const voidedAmountDiv = dividend.amount - deductFromAvailableDiv

          const afterRefundDiv = {
            consumeBalance: user.consumeBalance,
            earningsAvailable: user.earningsAvailable - deductFromAvailableDiv,
            earningsPending: user.earningsPending,
            earningsVoided: user.earningsVoided + voidedAmountDiv,
          }

          const updateDataDiv: Record<string, { decrement?: number; increment?: number }> = {
            earningsAvailable: { decrement: deductFromAvailableDiv },
          }
          if (voidedAmountDiv > 0) {
            updateDataDiv.earningsVoided = { increment: voidedAmountDiv }
          }
          await tx.user.update({
            where: { id: dividend.userId },
            data: updateDataDiv,
          })

          const voidDescDiv = voidedAmountDiv > 0
            ? `，其中可提现收益扣减 ¥${deductFromAvailableDiv.toFixed(2)}，作废收益 ¥${voidedAmountDiv.toFixed(2)}`
            : `，可提现收益扣减 ¥${dividend.amount.toFixed(2)}`
          dividendBalanceRecords.push({
            userId: dividend.userId,
            type: 'refund_dividend',
            amount: -dividend.amount,
            balance: user.balance,
            frozenBalance: user.frozenBalance,
            sourceType: 'dividend',
            sourceId: dividend.id,
            description: `扣回分红，余额不变${voidDescDiv}，订单退款${format4FieldDelta(user, afterRefundDiv)}`,
          })
        }

        if (dividendBalanceRecords.length > 0) {
          await tx.balanceRecord.createMany({ data: dividendBalanceRecords })
        }
      }
    }
    if (outerTx) {
      await execute(outerTx)
    } else {
      await prisma.$transaction(execute)
    }
  }
  static async getRewardsList(params: { page: number; pageSize: number; type?: string; search?: string; startDate?: string; endDate?: string }) {
    const { page, pageSize, type, search, startDate, endDate } = params

    const userSearchFilter = search ? {
      user: {
        OR: [
          { phone: { contains: search } },
          { nickname: { contains: search } },
        ],
      },
    } : {}

    const dateFilter = (startDate || endDate) ? (() => {
      const createdAt: Record<string, Date> = {}
      if (startDate) createdAt.gte = new Date(startDate)
      if (endDate) createdAt.lte = new Date(new Date(endDate).setHours(23, 59, 59, 999))
      return { createdAt }
    })() : {}

    const rewardWhere: Record<string, unknown> = { ...userSearchFilter, ...dateFilter }
    if (type && type !== 'dividend') {
      rewardWhere.type = type
    } else if (!type) {
      rewardWhere.type = { not: 'dividend' }
    }

    const dividendWhere: Record<string, unknown> = { ...userSearchFilter, ...dateFilter }

    // ── Rewards data ──
    let rewardsPromise: Promise<any[]>
    let rewardCountPromise: Promise<number>

    if (!type || type !== 'dividend') {
      rewardsPromise = prisma.reward.findMany({
        where: rewardWhere,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, phone: true, nickname: true, level: true } },
          order: { select: { id: true, orderNo: true } },
        },
      })
      rewardCountPromise = prisma.reward.count({ where: rewardWhere })
    } else {
      rewardsPromise = Promise.resolve([])
      rewardCountPromise = Promise.resolve(0)
    }

    // ── Dividends data ──
    let dividendsPromise: Promise<any[]>
    let dividendCountPromise: Promise<number>

    if (!type || type === 'dividend') {
      dividendsPromise = prisma.dividend.findMany({
        where: dividendWhere,
        orderBy: { createdAt: 'desc' },
        skip: type === 'dividend' ? (page - 1) * pageSize : 0,
        take: type === 'dividend' ? pageSize : 1000,
        include: {
          user: { select: { id: true, phone: true, nickname: true, level: true } },
          order: { select: { id: true, orderNo: true } },
        },
      })
      dividendCountPromise = prisma.dividend.count({ where: dividendWhere })
    } else {
      dividendsPromise = Promise.resolve([])
      dividendCountPromise = Promise.resolve(0)
    }

    // ── Stats ──
    const statsCondition = { ...userSearchFilter, ...dateFilter }
    const rewardStatsPromise = prisma.reward.groupBy({
      by: ['type'],
      where: { ...statsCondition, status: 'paid' },
      _sum: { amount: true },
      _count: true,
    })
    const dividendStatsPromise = prisma.dividend.aggregate({
      where: statsCondition,
      _sum: { amount: true },
      _count: true,
    })

    const [rewards, rewardTotal, dividends, dividendTotal, rewardStats, dividendStats] = await Promise.all([
      rewardsPromise,
      rewardCountPromise,
      dividendsPromise,
      dividendCountPromise,
      rewardStatsPromise,
      dividendStatsPromise,
    ])

    return {
      rewards,
      rewardTotal,
      dividends,
      dividendTotal,
      rewardStats,
      dividendStats,
    }
  }

  static async createManualReward(params: {
    userId: string
    adminId: string
    amount: number
    type?: string
    reason: string
  }) {
    const { userId, adminId, amount, type, reason } = params
    const rewardType = type || 'manual'

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user || user.status === 'deleted') throw new Error('用户不存在')

    return prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({
        where: { id: userId },
        select: BALANCE_SELECT,
      })
      if (!before) throw new Error('用户不存在')

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { earningsAvailable: { increment: amount } },
        select: { id: true, phone: true, nickname: true, balance: true },
      })

      const manualReward = await tx.manualReward.create({
        data: {
          userId,
          amount,
          type: rewardType,
          reason,
          operatorId: adminId,
        },
      })

      const afterReward = {
        consumeBalance: before.consumeBalance,
        earningsAvailable: before.earningsAvailable + amount,
        earningsPending: before.earningsPending,
        earningsVoided: before.earningsVoided,
      }

      await tx.balanceRecord.create({
        data: {
          userId,
          type: 'manual_reward',
          amount,
          balance: before.balance,
          frozenBalance: before.frozenBalance,
          sourceType: 'manual_reward',
          sourceId: manualReward.id,
          description: `手动奖励 ¥${amount.toFixed(2)}，可提现收益增加，余额不变，原因：${reason}${format4FieldDelta(before, afterReward)}`,
        },
      })

      return { user: updatedUser, reward: manualReward }
    })
  }


  /**
   * D-6.3: 获取用户奖励列表（含订单和来源用户关联）
   */
  static async getUserRewards(userId: string, type?: string) {
    return prisma.reward.findMany({
      where: {
        userId,
        ...(type && { type }),
        status: { not: 'refunded' },
      },
      include: {
        order: {
          select: {
            orderNo: true,
            payAmount: true,
          },
        },
        fromUser: {
          select: {
            id: true,
            phone: true,
            nickname: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }



  // ---- D-16: 业务逻辑从 routes 迁入 ----

  /** 构建奖励统计（从 admin/rewards/route.ts 迁入） */
  static buildStats(
    rewardStats: Array<{ type: string; _sum: { amount: number | null }; _count: number }>,
    dividendStats: { _sum: { amount: number | null }; _count: number },
  ) {
    const stats: Record<string, { total: number; count: number }> = {
      referral: { total: 0, count: 0 },
      brand_bonus: { total: 0, count: 0 },
      dividend: { total: 0, count: 0 },
    }

    for (const stat of rewardStats) {
      if (stat.type in stats) {
        stats[stat.type] = {
          total: stat._sum.amount || 0,
          count: stat._count,
        }
      }
    }

    stats.dividend = {
      total: dividendStats._sum.amount || 0,
      count: dividendStats._count,
    }

    const grandTotal = Object.values(stats).reduce((sum, s) => sum + s.total, 0)
    const grandCount = Object.values(stats).reduce((sum, s) => sum + s.count, 0)

    return { ...stats, grandTotal, grandCount }
  }

  /** 格式化奖励列表（合并 reward + dividend，统一排序，支持按 type 过滤） */
  static formatRewardList(raw: {
    rewards: Array<{
      id: string; userId: string; type: string; amount: number;
      orderId: string; fromUserId: string | null; level: number | null;
      status: string; createdAt: Date;
      user: { id: string; phone: string; nickname: string | null; level: number };
      order: { id: string; orderNo: string } | null;
    }>
    dividends: Array<{
      id: string; userId: string; amount: number; userLevel: number;
      totalPool: number; dividendDate: Date; orderId: string; createdAt: Date;
      user: { id: string; phone: string; nickname: string | null; level: number };
      order: { id: string; orderNo: string } | null;
    }>
    rewardStats: Array<{ type: string; _sum: { amount: number | null }; _count: number }>
    dividendStats: { _sum: { amount: number | null }; _count: number }
    type?: string
  }) {
    const { rewards, dividends, rewardStats, dividendStats, type } = raw

    const formattedDividends = dividends.map(d => ({
      id: d.id, userId: d.userId, user: d.user,
      type: "dividend" as const, amount: d.amount,
      orderId: d.orderId, orderNo: d.order?.orderNo || null,
      fromUserId: null, level: null,
      status: "paid" as const, createdAt: d.createdAt,
    }))

    const stats = RewardService.buildStats(rewardStats, dividendStats)

    if (type === "dividend") {
      return { records: formattedDividends, stats }
    }

    const formattedRewards = rewards.map(r => ({
      id: r.id, userId: r.userId, user: r.user, type: r.type,
      amount: r.amount, orderId: r.orderId, orderNo: r.order?.orderNo || null,
      fromUserId: r.fromUserId, level: r.level, status: r.status, createdAt: r.createdAt,
    }))

    if (type) {
      return { records: formattedRewards, stats }
    }

    const allRewards = [
      ...formattedRewards,
      ...formattedDividends,
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return { records: allRewards, stats }
  }

}
