import { prisma } from '@/lib/prisma'
import { UserService } from './user.service'
import { REWARD_RATES, MEMBER_LEVELS, TEAM_REWARD_LEVELS } from '@/lib/constants'

export class RewardService {
  // 创建直推奖（10%）
  static async createReferralReward(orderId: string, orderAmount: number, referrerId: string, fromUserId: string) {
    const amount = orderAmount * REWARD_RATES.REFERRAL

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
        select: { balance: true, frozenBalance: true },
      })

      await tx.user.update({
        where: { id: referrerId },
        data: { balance: { increment: amount } },
      })

      if (before) {
        await tx.balanceRecord.create({
          data: {
            userId: referrerId,
            type: 'referral_reward',
            amount,
            balance: before.balance + amount,
            frozenBalance: before.frozenBalance,
            sourceType: 'reward',
            sourceId: reward.id,
            description: `直推奖 +¥${amount.toFixed(2)}，订单 ${orderId}`,
          },
        })
      }
    })
  }

  // 创建品牌管理奖（推荐人的经销商下级购买普通商品时触发）
  static async createBrandBonusReward(orderId: string, orderAmount: number, referrerId: string, fromUserId: string) {
    const referrer = await prisma.user.findUnique({
      where: { id: referrerId },
      select: { level: true },
    })
    if (!referrer || referrer.level < MEMBER_LEVELS.DISTRIBUTOR) return

    const amount = orderAmount * REWARD_RATES.BRAND_BONUS

    await prisma.$transaction(async (tx) => {
      const reward = await tx.reward.create({
        data: {
          userId: referrerId,
          type: 'brand_bonus',
          orderId,
          amount,
          fromUserId,
          status: 'paid',
        },
      })

      const before = await tx.user.findUnique({
        where: { id: referrerId },
        select: { balance: true, frozenBalance: true },
      })

      await tx.user.update({
        where: { id: referrerId },
        data: { balance: { increment: amount } },
      })

      if (before) {
        await tx.balanceRecord.create({
          data: {
            userId: referrerId,
            type: 'brand_bonus',
            amount,
            balance: before.balance + amount,
            frozenBalance: before.frozenBalance,
            sourceType: 'reward',
            sourceId: reward.id,
            description: `品牌管理奖 +¥${amount.toFixed(2)}，订单 ${orderId}`,
          },
        })
      }
    })
  }

  // 创建团队奖（向上遍历推荐链3级：5%/3%/2%）
  static async createTeamRewards(orderId: string, orderAmount: number, buyerId: string) {
    // 从购买者的推荐人开始，向上遍历最多3级
    let currentUserId: string = buyerId
    const visitedIds = new Set<string>() // 防止循环

    for (const teamLevel of TEAM_REWARD_LEVELS) {
      // 获取当前用户的推荐人
      const currentUser = await prisma.user.findUnique({
        where: { id: currentUserId },
        select: { referrerId: true },
      })

      if (!currentUser?.referrerId) break // 没有推荐人了，停止

      const referrerId: string = currentUser.referrerId

      // 防止循环依赖
      if (visitedIds.has(referrerId)) break
      visitedIds.add(referrerId)

      // 推荐人必须是经销商及以上等级才可获得团队奖
      const referrer = await prisma.user.findUnique({
        where: { id: referrerId },
        select: { level: true },
      })

      if (!referrer || referrer.level < MEMBER_LEVELS.DISTRIBUTOR) {
        // 该级不符合条件，继续向上
        currentUserId = referrerId
        continue
      }

      const amount = orderAmount * teamLevel.rate

      await prisma.$transaction(async (tx) => {
        const reward = await tx.reward.create({
          data: {
            userId: referrerId,
            type: 'team',
            orderId,
            amount,
            fromUserId: buyerId,
            level: teamLevel.level,
            status: 'paid',
          },
        })

        const before = await tx.user.findUnique({
          where: { id: referrerId },
          select: { balance: true, frozenBalance: true },
        })

        await tx.user.update({
          where: { id: referrerId },
          data: { balance: { increment: amount } },
        })

        if (before) {
          await tx.balanceRecord.create({
            data: {
              userId: referrerId,
              type: 'team_reward',
              amount,
              balance: before.balance + amount,
              frozenBalance: before.frozenBalance,
              sourceType: 'reward',
              sourceId: reward.id,
              description: `团队奖（第${teamLevel.level}层）+¥${amount.toFixed(2)}，订单 ${orderId}`,
            },
          })
        }
      })

      currentUserId = referrerId
    }
  }

  // 创建分红奖（根据用户等级分配分红池）
  static async createDividendReward(orderId: string, orderAmount: number, buyerId: string) {
    // 分红比例
    const dividendRate = REWARD_RATES.DIVIDEND
    const totalPool = orderAmount * dividendRate

    // 获取购买者所在团队中所有符合条件的用户（总监及以上）
    // 向上遍历推荐链找到所有符合条件的上级
    const eligibleUsers: Array<{ userId: string; level: number }> = []
    const visitedIds = new Set<string>()
    let currentUserId: string = buyerId

    // 安全上限，防止意外无限循环
    let loopGuard = 0
    const MAX_DEPTH = 50

    while (loopGuard < MAX_DEPTH) {
      loopGuard++
      const currentUser = await prisma.user.findUnique({
        where: { id: currentUserId },
        select: { referrerId: true, level: true, id: true },
      })

      if (!currentUser?.referrerId) break
      if (visitedIds.has(currentUser.referrerId)) break
      visitedIds.add(currentUser.referrerId)

      const referrer = await prisma.user.findUnique({
        where: { id: currentUser.referrerId },
        select: { id: true, level: true },
      })

      if (referrer && referrer.level >= MEMBER_LEVELS.SUPERVISOR) {
        eligibleUsers.push({ userId: referrer.id, level: referrer.level })
      }

      currentUserId = currentUser.referrerId
    }

    if (eligibleUsers.length === 0) return

    // 按等级权重分配分红池（等级越高权重越大）
    const levelWeights: Record<number, number> = {
      [MEMBER_LEVELS.SUPERVISOR]: 1,
      [MEMBER_LEVELS.PRESIDENT]: 2,
      [MEMBER_LEVELS.BOARD]: 3,
    }

    const totalWeight = eligibleUsers.reduce((sum, u) => sum + (levelWeights[u.level] || 1), 0)

    // 使用事务批量发放分红
    await prisma.$transaction(async (tx) => {
      for (const eligible of eligibleUsers) {
        const weight = levelWeights[eligible.level] || 1
        const amount = Math.round((totalPool * weight / totalWeight) * 100) / 100 // 保留2位小数

        if (amount <= 0) continue

        const dividend = await tx.dividend.create({
          data: {
            userId: eligible.userId,
            orderId,
            amount,
            userLevel: eligible.level,
            totalPool,
            dividendDate: new Date(),
          },
        })

        const before = await tx.user.findUnique({
          where: { id: eligible.userId },
          select: { balance: true, frozenBalance: true },
        })

        await tx.user.update({
          where: { id: eligible.userId },
          data: { balance: { increment: amount } },
        })

        if (before) {
          await tx.balanceRecord.create({
            data: {
              userId: eligible.userId,
              type: 'dividend_reward',
              amount,
              balance: before.balance + amount,
              frozenBalance: before.frozenBalance,
              sourceType: 'reward',
              sourceId: dividend.id,
              description: `分红奖 +¥${amount.toFixed(2)}，订单 ${orderId}`,
            },
          })
        }
      }
    })
  }

  // 处理订单奖励（主入口）
  static async processOrderRewards(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true,
        items: {
          include: { product: true },
        },
      },
    })

    if (!order || order.status !== 'paid') return

    const buyer = order.user
    const orderAmount = order.payAmount

    // 检查是否购买升级产品
    const hasUpgradeProduct = order.items.some(
      (item: { product: { isUpgradeProduct: boolean } }) => item.product.isUpgradeProduct
    )

    // 1. 发放直推奖（10%）
    if (buyer.referrerId) {
      await this.createReferralReward(orderId, orderAmount, buyer.referrerId, buyer.id)
    }

    // 2. 发放团队奖（3级：5%/3%/2%）—— 需购买者有推荐人
    if (buyer.referrerId) {
      await this.createTeamRewards(orderId, orderAmount, buyer.id)
    }

    // 3. 发放品牌管理奖：购买者必须是经销商以上，且购买的是普通商品，推荐人也是经销商以上
    if (buyer.referrerId && buyer.level >= MEMBER_LEVELS.DISTRIBUTOR && !hasUpgradeProduct) {
      await this.createBrandBonusReward(orderId, orderAmount, buyer.referrerId, buyer.id)
    }

    // 4. 发放分红奖（总监及以上等级的上级按权重分配5%分红池）
    await this.createDividendReward(orderId, orderAmount, buyer.id)

    // 5. 检查升级
    await this.checkUpgradeFromOrder(buyer.id, order)
  }

  // 检查订单导致的升级
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
    }
  }

  // 获取用户奖励统计
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

    const teamTotal = paidRewards
      .filter(r => r.type === 'team')
      .reduce((sum, r) => sum + r.amount, 0)

    const dividendTotal = dividends.reduce((sum, d) => sum + d.amount, 0)

    const totalAmount = referralTotal + brandBonusTotal + teamTotal + dividendTotal

    return {
      totalAmount,
      referralTotal,
      brandBonusTotal,
      teamTotal,
      dividendTotal,
      totalCount: paidRewards.length + dividends.length,
    }
  }

  // 处理退款（扣回已发放的奖励）
  static async processRefund(orderId: string) {
    const rewards = await prisma.reward.findMany({
      where: { orderId, status: 'paid' },
    })

    const dividends = await prisma.dividend.findMany({
      where: { orderId },
    })

    await prisma.$transaction(async (tx) => {
      // 扣回奖励
      for (const reward of rewards) {
        // 读取用户当前余额，用于校验和写流水
        const user = await tx.user.findUnique({
          where: { id: reward.userId },
          select: { balance: true, frozenBalance: true },
        })
        if (!user) throw new Error(`用户 ${reward.userId} 不存在`)

        if (user.balance < reward.amount) {
          throw new Error(`用户 ${reward.userId} 余额不足，无法扣回奖励 ¥${reward.amount}，当前余额 ¥${user.balance}`)
        }

        const newBalance = user.balance - reward.amount

        await tx.user.update({
          where: { id: reward.userId },
          data: { balance: { decrement: reward.amount } },
        })

        await tx.reward.update({
          where: { id: reward.id },
          data: { status: 'refunded' },
        })

        // 写 BalanceRecord 流水
        await tx.balanceRecord.create({
          data: {
            userId: reward.userId,
            type: 'refund_reward',
            amount: -reward.amount,
            balance: newBalance,
            frozenBalance: user.frozenBalance,
            sourceType: 'reward',
            sourceId: reward.id,
            description: `扣回奖励（${reward.type}），订单退款`,
          },
        })
      }

      // 扣回分红
      for (const dividend of dividends) {
        const user = await tx.user.findUnique({
          where: { id: dividend.userId },
          select: { balance: true, frozenBalance: true },
        })
        if (!user) throw new Error(`用户 ${dividend.userId} 不存在`)

        if (user.balance < dividend.amount) {
          throw new Error(`用户 ${dividend.userId} 余额不足，无法扣回分红 ¥${dividend.amount}，当前余额 ¥${user.balance}`)
        }

        const newBalance = user.balance - dividend.amount

        await tx.user.update({
          where: { id: dividend.userId },
          data: { balance: { decrement: dividend.amount } },
        })

        await tx.dividend.delete({
          where: { id: dividend.id },
        })

        // 写 BalanceRecord 流水
        await tx.balanceRecord.create({
          data: {
            userId: dividend.userId,
            type: 'refund_dividend',
            amount: -dividend.amount,
            balance: newBalance,
            frozenBalance: user.frozenBalance,
            sourceType: 'reward',
            sourceId: dividend.id,
            description: `扣回分红，订单退款`,
          },
        })
      }
    })
  }
}