import { prisma } from '@/lib/prisma'
import { UserService } from './user.service'
import { REWARD_RATES, MEMBER_LEVELS, TEAM_REWARD_LEVELS } from '@/lib/constants'

export class RewardService {
  // 创建直推奖（10%）
  static async createReferralReward(orderId: string, orderAmount: number, referrerId: string, fromUserId: string) {
    const amount = orderAmount * REWARD_RATES.REFERRAL

    await prisma.$transaction(async (tx) => {
      await tx.reward.create({
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

      await tx.user.update({
        where: { id: referrerId },
        data: { balance: { increment: amount } },
      })
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
      await tx.reward.create({
        data: {
          userId: referrerId,
          type: 'brand_bonus',
          orderId,
          amount,
          fromUserId,
          status: 'paid',
        },
      })

      await tx.user.update({
        where: { id: referrerId },
        data: { balance: { increment: amount } },
      })
    })
  }

  // 创建团队奖（向上遍历推荐链3级：5%/3%/2%）- 优化版：批量查询推荐链
  static async createTeamRewards(orderId: string, orderAmount: number, buyerId: string) {
    // 批量获取推荐链上的用户（最多3级+1 = 4次查询，但实际只需向上3级）
    const referrerChain: Array<{ userId: string; referrerId: string | null; level: number }> = []
    let currentId = buyerId
    const visitedIds = new Set<string>()

    // 一次性获取所有需要的用户信息（最多4个用户）
    for (let i = 0; i < 3; i++) {
      const currentUser = await prisma.user.findUnique({
        where: { id: currentId },
        select: { referrerId: true },
      })

      if (!currentUser?.referrerId) break
      if (visitedIds.has(currentUser.referrerId)) break
      visitedIds.add(currentUser.referrerId)

      const referrer = await prisma.user.findUnique({
        where: { id: currentUser.referrerId },
        select: { id: true, level: true, referrerId: true },
      })

      if (!referrer) break

      referrerChain.push({
        userId: referrer.id,
        referrerId: referrer.referrerId,
        level: referrer.level,
      })

      currentId = referrer.id
    }

    // 批量创建奖励（使用单个事务）
    if (referrerChain.length === 0) return

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < referrerChain.length && i < TEAM_REWARD_LEVELS.length; i++) {
        const referrer = referrerChain[i]
        const teamLevel = TEAM_REWARD_LEVELS[i]

        // 推荐人必须是经销商及以上等级
        if (referrer.level < MEMBER_LEVELS.DISTRIBUTOR) continue

        const amount = orderAmount * teamLevel.rate

        await tx.reward.create({
          data: {
            userId: referrer.userId,
            type: 'team',
            orderId,
            amount,
            fromUserId: buyerId,
            level: teamLevel.level,
            status: 'paid',
          },
        })

        await tx.user.update({
          where: { id: referrer.userId },
          data: { balance: { increment: amount } },
        })
      }
    })
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

        await tx.dividend.create({
          data: {
            userId: eligible.userId,
            orderId,
            amount,
            userLevel: eligible.level,
            totalPool,
            dividendDate: new Date(),
          },
        })

        await tx.user.update({
          where: { id: eligible.userId },
          data: { balance: { increment: amount } },
        })
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

  // 获取用户奖励统计 - 优化版：使用 aggregate 聚合查询
  static async getUserRewardStats(userId: string) {
    const [rewardStats, dividendStats, totalCount] = await Promise.all([
      prisma.reward.groupBy({
        by: ['type'],
        where: { userId, status: 'paid' },
        _sum: { amount: true },
      }),
      prisma.dividend.aggregate({
        where: { userId },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.reward.count({
        where: { userId, status: 'paid' },
      }),
    ])

    const statsMap: Record<string, number> = {}
    for (const stat of rewardStats) {
      statsMap[stat.type] = stat._sum.amount || 0
    }

    const referralTotal = statsMap['referral'] || 0
    const brandBonusTotal = statsMap['brand_bonus'] || 0
    const teamTotal = statsMap['team'] || 0
    const dividendTotal = dividendStats._sum.amount || 0
    const totalAmount = referralTotal + brandBonusTotal + teamTotal + dividendTotal

    return {
      totalAmount,
      referralTotal,
      brandBonusTotal,
      teamTotal,
      dividendTotal,
      totalCount: totalCount + dividendStats._count,
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
        await tx.user.update({
          where: { id: reward.userId },
          data: { balance: { decrement: reward.amount } },
        })

        await tx.reward.update({
          where: { id: reward.id },
          data: { status: 'refunded' },
        })
      }

      // 扣回分红
      for (const dividend of dividends) {
        await tx.user.update({
          where: { id: dividend.userId },
          data: { balance: { decrement: dividend.amount } },
        })

        await tx.dividend.delete({
          where: { id: dividend.id },
        })
      }
    })
  }
}