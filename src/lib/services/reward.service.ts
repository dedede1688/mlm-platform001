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
      include: { user: true, items: { include: { product: true } } },
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
    const rewards = await prisma.reward.findMany({
      where: { userId },
    })

    const dividends = await prisma.dividend.findMany({
      where: { userId },
    })

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
}
