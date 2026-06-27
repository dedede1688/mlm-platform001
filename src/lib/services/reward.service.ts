import { prisma } from '@/lib/prisma'
import { UserService } from './user.service'
import { MEMBER_LEVELS } from '@/lib/constants'
import { getBusinessConfig } from '@/lib/config/business'
import { logger } from '@/lib/logger'
import { format4FieldDelta } from '@/lib/utils/balance-record-desc'

async function findBrandBonusRecipients(
  buyerId: string,
  maxLayers: number
): Promise<Array<{ userId: string; layer: number }>> {
  const recipients: Array<{ userId: string; layer: number }> = []
  let currentId: string | null = buyerId
  let layer = 0
  const visited = new Set<string>()
  const MAX_DEPTH = 50

  while (layer < maxLayers && currentId && recipients.length < MAX_DEPTH) {
    const user: { parentId: string | null } | null = await prisma.user.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    })
    if (!user?.parentId) break
    if (visited.has(user.parentId)) break
    visited.add(user.parentId)

    const parent = await prisma.user.findUnique({
      where: { id: user.parentId },
      select: { id: true, level: true },
    })
    if (!parent) break

    layer++
    if (parent.level >= MEMBER_LEVELS.DISTRIBUTOR) {
      recipients.push({ userId: parent.id, layer })
    }

    currentId = user.parentId
  }

  return recipients
}

function computeMaxLayers(referrer: { level: number; directDistributorCount: number }): number {
  if (referrer.level >= MEMBER_LEVELS.DIRECTOR) return 10
  if (referrer.level === MEMBER_LEVELS.DISTRIBUTOR) {
    if (referrer.directDistributorCount >= 2) return 10
    if (referrer.directDistributorCount >= 1) return 4
    return 2
  }
  return 0
}

export class RewardService {
  static async createReferralReward(orderId: string, orderAmount: number, referrerId: string, fromUserId: string): Promise<{ unlockRequired: boolean; amount?: number }> {
    const rate = await getBusinessConfig<number>('reward.referral_rate', 0.20)

    const referrer = await prisma.user.findUnique({
      where: { id: referrerId },
      select: { upgradeProductCount: true },
    })
    if (!referrer || referrer.upgradeProductCount < 1) {
      logger.info(`直推奖未发放：推荐人 ${referrerId} 未购买升级品，订单 ${orderId}`)
      return { unlockRequired: true, amount: orderAmount * rate }
    }

    const amount = orderAmount * rate

    await prisma.$transaction(async (tx) => {
      const reward = await tx.reward.create({
        data: {
          userId: referrerId,
          type: 'referral',
          orderId,
          amount,
          fromUserId,
          level: 1,
          status: 'paid',
        },
      })

      const before = await tx.user.findUnique({
        where: { id: referrerId },
        select: { balance: true, frozenBalance: true, consumeBalance: true, earningsAvailable: true, earningsPending: true, earningsVoided: true },
      })

      await tx.user.update({
        where: { id: referrerId },
        data: { balance: { increment: amount }, earningsAvailable: { increment: amount } },
      })

      if (before) {
        const after = { consumeBalance: before.consumeBalance, earningsAvailable: before.earningsAvailable + amount, earningsPending: before.earningsPending, earningsVoided: before.earningsVoided }
        await tx.balanceRecord.create({
          data: {
            userId: referrerId,
            type: 'referral_reward',
            amount,
            balance: before.balance + amount,
            frozenBalance: before.frozenBalance,
            sourceType: 'reward',
            sourceId: reward.id,
            description: `直推奖 +¥${amount.toFixed(2)}，订单 ${orderId}${format4FieldDelta(before, after)}`,
          },
        })
      }
    })

    return { unlockRequired: false, amount }
  }

  static async createBrandBonusReward(orderId: string, orderAmount: number, buyerId: string, referrerId: string) {
    const referrer = await prisma.user.findUnique({
      where: { id: referrerId },
      select: { level: true, directDistributorCount: true },
    })
    if (!referrer || referrer.level < MEMBER_LEVELS.DISTRIBUTOR) return

    const maxLayers = computeMaxLayers(referrer)
    if (maxLayers === 0) return

    const paidCount = await prisma.order.count({
      where: { userId: buyerId, status: { in: ['paid', 'shipped', 'completed'] } },
    })
    const targetLayer = ((paidCount - 1) % 10) + 1

    const recipients = await findBrandBonusRecipients(buyerId, maxLayers)
    const target = recipients.find(r => r.layer === targetLayer)

    if (!target) {
      const rate = await getBusinessConfig<number>('reward.brand_bonus_rate', 0.20)
      const sinkAmount = orderAmount * rate
      await prisma.operationLog.create({
        data: {
          userId: buyerId,
          action: 'BRAND_BONUS_SINK',
          module: 'reward',
          targetId: orderId,
          newValue: { orderId, layer: targetLayer, orderAmount, sinkAmount, reason: '安置链无对应经销商或超过层数上限' },
        },
      })
      logger.info(`品牌管理奖沉淀：订单 ${orderId}，第 ${targetLayer} 层无经销商，金额 ¥${sinkAmount.toFixed(2)}`)
      return
    }

    const rate = await getBusinessConfig<number>('reward.brand_bonus_rate', 0.20)
    const amount = orderAmount * rate

    await prisma.$transaction(async (tx) => {
      const reward = await tx.reward.create({
        data: {
          userId: target.userId,
          type: 'brand_bonus',
          orderId,
          amount,
          fromUserId: buyerId,
          level: target.layer,
          status: 'paid',
        },
      })

      const before = await tx.user.findUnique({
        where: { id: target.userId },
        select: { balance: true, frozenBalance: true, consumeBalance: true, earningsAvailable: true, earningsPending: true, earningsVoided: true },
      })

      await tx.user.update({
        where: { id: target.userId },
        data: { balance: { increment: amount }, earningsAvailable: { increment: amount } },
      })

      if (before) {
        const after = { consumeBalance: before.consumeBalance, earningsAvailable: before.earningsAvailable + amount, earningsPending: before.earningsPending, earningsVoided: before.earningsVoided }
        await tx.balanceRecord.create({
          data: {
            userId: target.userId,
            type: 'brand_bonus',
            amount,
            balance: before.balance + amount,
            frozenBalance: before.frozenBalance,
            sourceType: 'reward',
            sourceId: reward.id,
            description: `品牌管理奖（第${target.layer}层）+¥${amount.toFixed(2)}，订单 ${orderId}${format4FieldDelta(before, after)}`,
          },
        })
      }
    })
  }

  static async createDividendReward(orderId: string, orderAmount: number, buyerId: string) {
    const eligibleUsers: Array<{ userId: string; level: number }> = []
    let currentUserId: string = buyerId
    const visited = new Set<string>()
    let depth = 0
    const MAX_DEPTH = 50

    while (depth < MAX_DEPTH) {
      depth++
      const user = await prisma.user.findUnique({
        where: { id: currentUserId },
        select: { referrerId: true, level: true, id: true },
      })
      if (!user?.referrerId) break
      if (visited.has(user.referrerId)) break
      visited.add(user.referrerId)

      const referrer = await prisma.user.findUnique({
        where: { id: user.referrerId },
        select: { id: true, level: true },
      })

      if (referrer && referrer.level >= MEMBER_LEVELS.DIRECTOR) {
        eligibleUsers.push({ userId: referrer.id, level: referrer.level })
      }
      currentUserId = user.referrerId
    }

    if (eligibleUsers.length === 0) return

    const pools = [
      { level: MEMBER_LEVELS.DIRECTOR, configKey: 'director' },
      { level: MEMBER_LEVELS.MANAGER, configKey: 'manager' },
      { level: MEMBER_LEVELS.SUPERVISOR, configKey: 'supervisor' },
      { level: MEMBER_LEVELS.PRESIDENT, configKey: 'president' },
      { level: MEMBER_LEVELS.BOARD, configKey: 'board' },
    ]

    for (const pool of pools) {
      const rate = await getBusinessConfig<number>(`dividend.${pool.configKey}.rate`, 0.05)
      if (rate === 0) continue

      const includeUpstream = await getBusinessConfig<boolean>(`dividend.${pool.configKey}.include_upstream`, false)

      const poolMembers = eligibleUsers.filter(u => {
        if (includeUpstream) return u.level >= pool.level
        return u.level === pool.level
      })

      if (poolMembers.length === 0) continue

      const totalPool = orderAmount * rate
      const perUserAmount = Math.round((totalPool / poolMembers.length) * 100) / 100

      await prisma.$transaction(async (tx) => {
        for (const member of poolMembers) {
          const dividend = await tx.dividend.create({
            data: {
              userId: member.userId,
              orderId,
              amount: perUserAmount,
              userLevel: member.level,
              totalPool,
              dividendDate: new Date(),
            },
          })

          const before = await tx.user.findUnique({
            where: { id: member.userId },
            select: { balance: true, frozenBalance: true, consumeBalance: true, earningsAvailable: true, earningsPending: true, earningsVoided: true },
          })

          await tx.user.update({
            where: { id: member.userId },
            data: { balance: { increment: perUserAmount }, earningsAvailable: { increment: perUserAmount } },
          })

          if (before) {
            const after = { consumeBalance: before.consumeBalance, earningsAvailable: before.earningsAvailable + perUserAmount, earningsPending: before.earningsPending, earningsVoided: before.earningsVoided }
            await tx.balanceRecord.create({
              data: {
                userId: member.userId,
                type: 'dividend_reward',
                amount: perUserAmount,
                balance: before.balance + perUserAmount,
                frozenBalance: before.frozenBalance,
                sourceType: 'dividend',
                sourceId: dividend.id,
                description: `分红奖（${pool.configKey}池）+¥${perUserAmount.toFixed(2)}，订单 ${orderId}${format4FieldDelta(before, after)}`,
              },
            })
          }
        }
      })
    }
  }

  static async processOrderRewards(orderId: string): Promise<{ referralUnlockRequired?: boolean; referralUnlockAmount?: number }> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true,
        items: {
          include: { product: true },
        },
      },
    })

    if (!order || order.status !== 'paid') return {}

    const buyer = order.user
    const orderAmount = order.payAmount
    const hasUpgradeProduct = order.items.some(
      (item: { product: { isUpgradeProduct: boolean } }) => item.product.isUpgradeProduct
    )

    let referralResult: { unlockRequired: boolean; amount?: number } | undefined
    if (buyer.referrerId) {
      referralResult = await this.createReferralReward(orderId, orderAmount, buyer.referrerId, buyer.id)
    }

    if (buyer.referrerId && !hasUpgradeProduct) {
      await this.createBrandBonusReward(orderId, orderAmount, buyer.id, buyer.referrerId)
    }

    await this.createDividendReward(orderId, orderAmount, buyer.id)

    await this.checkUpgradeFromOrder(buyer.id, order)

    return {
      referralUnlockRequired: referralResult?.unlockRequired,
      referralUnlockAmount: referralResult?.unlockRequired ? referralResult.amount : undefined,
    }
  }

  static async checkUpgradeFromOrder(userId: string, order: { items: Array<{ product: { isUpgradeProduct: boolean }; quantity: number }>; payAmount: number }) {
    const hasUpgradeProduct = order.items.some(
      (item) => item.product.isUpgradeProduct
    )

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

      await UserService.checkAndUpgradeLevel(userId)

      if (user?.referrerId) {
        await UserService.checkAndUpgradeLevel(user.referrerId)
      }
    } else {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { referrerId: true },
      })

      if (user?.referrerId) {
        await UserService.addDirectSales(user.referrerId, order.payAmount)
        await UserService.checkAndUpgradeLevel(user.referrerId)
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

  static async processRefund(orderId: string) {
    const rewards = await prisma.reward.findMany({
      where: { orderId, status: 'paid' },
    })

    const dividends = await prisma.dividend.findMany({
      where: { orderId },
    })

    await prisma.$transaction(async (tx) => {
      for (const reward of rewards) {
        const user = await tx.user.findUnique({
          where: { id: reward.userId },
          select: { balance: true, frozenBalance: true, consumeBalance: true, earningsAvailable: true, earningsPending: true, earningsVoided: true },
        })
        if (!user) throw new Error(`用户 ${reward.userId} 不存在`)

        if (user.balance < reward.amount) {
          throw new Error(`用户 ${reward.userId} 余额不足，无法扣回奖励 ¥${reward.amount}，当前余额 ¥${user.balance}`)
        }

        const newBalance = user.balance - reward.amount
        const afterRefundReward = { consumeBalance: user.consumeBalance, earningsAvailable: user.earningsAvailable - reward.amount, earningsPending: user.earningsPending, earningsVoided: user.earningsVoided }

        await tx.user.update({
          where: { id: reward.userId },
          data: { balance: { decrement: reward.amount }, earningsAvailable: { decrement: reward.amount } },
        })

        await tx.reward.update({
          where: { id: reward.id },
          data: { status: 'refunded' },
        })

        await tx.balanceRecord.create({
          data: {
            userId: reward.userId,
            type: 'refund_reward',
            amount: -reward.amount,
            balance: newBalance,
            frozenBalance: user.frozenBalance,
            sourceType: 'reward',
            sourceId: reward.id,
            description: `扣回奖励（${reward.type}），订单退款${format4FieldDelta(user, afterRefundReward)}`,
          },
        })
      }

      for (const dividend of dividends) {
        const user = await tx.user.findUnique({
          where: { id: dividend.userId },
          select: { balance: true, frozenBalance: true, consumeBalance: true, earningsAvailable: true, earningsPending: true, earningsVoided: true },
        })
        if (!user) throw new Error(`用户 ${dividend.userId} 不存在`)

        if (user.balance < dividend.amount) {
          throw new Error(`用户 ${dividend.userId} 余额不足，无法扣回分红 ¥${dividend.amount}，当前余额 ¥${user.balance}`)
        }

        const newBalance = user.balance - dividend.amount
        const afterRefundDiv = { consumeBalance: user.consumeBalance, earningsAvailable: user.earningsAvailable, earningsPending: user.earningsPending, earningsVoided: user.earningsVoided + dividend.amount }

        await tx.user.update({
          where: { id: dividend.userId },
          data: { balance: { decrement: dividend.amount }, earningsVoided: { increment: dividend.amount } },
        })

        await tx.dividend.delete({
          where: { id: dividend.id },
        })

        await tx.balanceRecord.create({
          data: {
            userId: dividend.userId,
            type: 'refund_dividend',
            amount: -dividend.amount,
            balance: newBalance,
            frozenBalance: user.frozenBalance,
            sourceType: 'reward',
            sourceId: dividend.id,
            description: `扣回分红，订单退款${format4FieldDelta(user, afterRefundDiv)}`,
          },
        })
      }
    })
  }
}
