import { prisma } from '@/lib/prisma'
import { UserService } from './user.service'
import { MEMBER_LEVELS, BALANCE_SELECT } from '@/lib/constants'
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
  // v60 step3 G: A 是会员时跳过 A，从安置链上第 1 个经销商开始（findBrandBonusRecipients 已实现跳过逻辑）
  if (referrer.level >= MEMBER_LEVELS.MEMBER) return 10
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
        select: BALANCE_SELECT,
      })

      await tx.user.update({
        where: { id: referrerId },
        data: { earningsAvailable: { increment: amount } },
      })

      if (before) {
        const after = { consumeBalance: before.consumeBalance, earningsAvailable: before.earningsAvailable + amount, earningsPending: before.earningsPending, earningsVoided: before.earningsVoided }
        await tx.balanceRecord.create({
          data: {
            userId: referrerId,
            type: 'referral_reward',
            amount,
            balance: before.balance,
            frozenBalance: before.frozenBalance,
            sourceType: 'reward',
            sourceId: reward.id,
            description: `直推奖 +¥${amount.toFixed(2)}，可提现收益增加，余额不变，订单 ${orderId}${format4FieldDelta(before, after)}`,
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
    // v60 step3 G: A 是会员时跳过 A，从安置链上第 1 个经销商开始（findBrandBonusRecipients 已实现跳过逻辑）
    if (!referrer) return

    const maxLayers = computeMaxLayers(referrer)
    if (maxLayers === 0) return  // 只有 maxLayers=0 才不发

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
        select: BALANCE_SELECT,
      })

      await tx.user.update({
        where: { id: target.userId },
        data: { earningsAvailable: { increment: amount } },
      })

      if (before) {
        const after = { consumeBalance: before.consumeBalance, earningsAvailable: before.earningsAvailable + amount, earningsPending: before.earningsPending, earningsVoided: before.earningsVoided }
        await tx.balanceRecord.create({
          data: {
            userId: target.userId,
            type: 'brand_bonus',
            amount,
            balance: before.balance,
            frozenBalance: before.frozenBalance,
            sourceType: 'reward',
            sourceId: reward.id,
            description: `品牌管理奖（第${target.layer}层）+¥${amount.toFixed(2)}，可提现收益增加，余额不变，订单 ${orderId}${format4FieldDelta(before, after)}`,
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
        // 模式 B：批量预取用户余额
        const memberIds = poolMembers.map(m => m.userId)
        const usersMap = new Map<string, { id: string; balance: number; frozenBalance: number; consumeBalance: number; earningsAvailable: number; earningsPending: number; earningsVoided: number; earningsFrozen: number }>()
        if (memberIds.length > 0) {
          const users = await tx.user.findMany({
            where: { id: { in: memberIds } },
            select: { id: true, ...BALANCE_SELECT },
          })
          for (const u of users) usersMap.set(u.id, u)
        }

        // 模式 A：收集 dividend 数据
        const dividendDataList = poolMembers.map(member => ({
          userId: member.userId,
          orderId,
          amount: perUserAmount,
          userLevel: member.level,
          totalPool,
          dividendDate: new Date(),
        }))
        if (dividendDataList.length > 0) {
          await tx.dividend.createMany({ data: dividendDataList })
        }

        // 模式 C：同 pool 内 perUserAmount 相同，批量 updateMany
        if (memberIds.length > 0) {
          await tx.user.updateMany({
            where: { id: { in: memberIds } },
            data: { earningsAvailable: { increment: perUserAmount } },
          })
        }

        // 模式 A：收集 balanceRecord 数据（每条用该用户自己的 before 计算）
        const balanceRecordDataList: Array<{ userId: string; type: string; amount: number; balance: number; frozenBalance: number; sourceType: string; sourceId: string; description: string }> = []
        for (const member of poolMembers) {
          const before = usersMap.get(member.userId)
          if (before) {
            const after = { consumeBalance: before.consumeBalance, earningsAvailable: before.earningsAvailable + perUserAmount, earningsPending: before.earningsPending, earningsVoided: before.earningsVoided }
            balanceRecordDataList.push({
              userId: member.userId,
              type: 'dividend_reward',
              amount: perUserAmount,
              balance: before.balance,
              frozenBalance: before.frozenBalance,
              sourceType: 'dividend',
              sourceId: orderId,
              description: `分红奖（${pool.configKey}池）+¥${perUserAmount.toFixed(2)}，可提现收益增加，余额不变，订单 ${orderId}${format4FieldDelta(before, after)}`,
            })
          }
        }
        if (balanceRecordDataList.length > 0) {
          await tx.balanceRecord.createMany({ data: balanceRecordDataList })
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

    let referralResult: { unlockRequired: boolean; amount?: number } | undefined
    if (buyer.referrerId) {
      referralResult = await this.createReferralReward(orderId, orderAmount, buyer.referrerId, buyer.id)
    }

    if (buyer.referrerId) {
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

    // v54 H: 升级品订单计入买家自己的销售额（业务规则 §7.4）
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
      // 模式 B：批量预取 rewards 相关用户余额
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

      // 模式 D：批量更新 reward 状态
      if (rewards.length > 0) {
        await tx.reward.updateMany({
          where: { id: { in: rewards.map(r => r.id) } },
          data: { status: 'refunded' },
        })
      }

      // 模式 A：批量写入 balanceRecord
      if (rewardBalanceRecords.length > 0) {
        await tx.balanceRecord.createMany({ data: rewardBalanceRecords })
      }

      // 模式 B：批量预取 dividends 相关用户余额
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
          sourceType: 'reward',
          sourceId: dividend.id,
          description: `扣回分红，余额不变${voidDescDiv}，订单退款${format4FieldDelta(user, afterRefundDiv)}`,
        })
      }

      // 批量删除 dividend
      if (dividends.length > 0) {
        await tx.dividend.deleteMany({
          where: { id: { in: dividends.map(d => d.id) } },
        })
      }

      // 模式 A：批量写入 balanceRecord
      if (dividendBalanceRecords.length > 0) {
        await tx.balanceRecord.createMany({ data: dividendBalanceRecords })
      }
    })
  }
}
