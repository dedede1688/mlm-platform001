import { prisma } from '@/lib/prisma'
import { UserService } from './user.service'
import { REWARD_RATES, MEMBER_LEVELS } from '@/lib/constants'

export class RewardService {
  // 创建推荐奖
  static async createReferralReward(orderId: string, orderAmount: number, referrerId: string, fromUserId: string) {
    const amount = orderAmount * 0.2 // 推荐奖为订单金额的20%
    
    // 创建奖励记录
    await prisma.reward.create({
      data: {
        userId: referrerId,
        type: 'referral',
        orderId,
        amount,
        fromUserId,
        status: 'paid',
      },
    })

    // 更新用户余额
    await prisma.user.update({
      where: { id: referrerId },
      data: {
        balance: {
          increment: amount,
        },
      },
    })
  }

  // 创建品牌管理奖（推荐人的经销商下级购买普通商品时触发）
  static async createBrandBonusReward(orderId: string, orderAmount: number, referrerId: string, fromUserId: string) {
    // 只有推荐人是经销商及以上等级时才发放品牌管理奖
    const referrer = await prisma.user.findUnique({
      where: { id: referrerId },
      select: { level: true },
    })
    if (!referrer || referrer.level < MEMBER_LEVELS.DISTRIBUTOR) return

    const amount = orderAmount * REWARD_RATES.BRAND_BONUS // 品牌管理奖为订单金额的20%

    // 创建奖励记录
    await prisma.reward.create({
      data: {
        userId: referrerId,
        type: 'brand_bonus',
        orderId,
        amount,
        fromUserId,
        status: 'paid',
      },
    })

    // 更新用户余额
    await prisma.user.update({
      where: { id: referrerId },
      data: {
        balance: {
          increment: amount,
        },
      },
    })
  }

  // 处理订单奖励
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

    // 发放推荐奖
    if (buyer.referrerId) {
      await this.createReferralReward(orderId, orderAmount, buyer.referrerId, buyer.id)
    }

    // 发放品牌管理奖：购买者必须是经销商以上，且购买的是普通商品，推荐人也是经销商以上
    const hasUpgradeProduct = order.items.some(
      (item: { product: { isUpgradeProduct: boolean } }) => item.product.isUpgradeProduct
    )
    if (buyer.referrerId && buyer.level >= MEMBER_LEVELS.DISTRIBUTOR && !hasUpgradeProduct) {
      await this.createBrandBonusReward(orderId, orderAmount, buyer.referrerId, buyer.id)
    }

    // 检查升级
    await this.checkUpgradeFromOrder(buyer.id, order)
  }

  // 检查订单导致的升级
  static async checkUpgradeFromOrder(userId: string, order: { items: Array<{ product: { isUpgradeProduct: boolean }; quantity: number }>; payAmount: number }) {
    // 检查是否购买了升级产品
    const hasUpgradeProduct = order.items.some(
      (item) => item.product.isUpgradeProduct
    )

    if (hasUpgradeProduct) {
      // 增加升级产品计数
      await UserService.addUpgradeProductCount(userId, 
        order.items
          .filter((item) => item.product.isUpgradeProduct)
          .reduce((sum, item) => sum + item.quantity, 0)
      )

      // 更新直推销售额
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { referrerId: true },
      })

      if (user?.referrerId) {
        await UserService.addDirectSales(user.referrerId, order.payAmount)
      }

      // 积分在升级为经销商时统一发放（购买10件升级产品后），此处不再逐件发放

      // 检查升级
      await UserService.checkAndUpgradeLevel(userId)
      
      // 检查推荐人升级
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

    // 只统计已支付的奖励
    const paidRewards = rewards.filter(r => r.status === 'paid')

    const referralTotal = paidRewards
      .filter(r => r.type === 'referral')
      .reduce((sum, r) => sum + r.amount, 0)

    const brandBonusTotal = paidRewards
      .filter(r => r.type === 'brand_bonus')
      .reduce((sum, r) => sum + r.amount, 0)

    const dividendTotal = paidRewards
      .filter(r => r.type === 'dividend')
      .reduce((sum, r) => sum + r.amount, 0)

    const totalAmount = paidRewards.reduce((sum, r) => sum + r.amount, 0)

    return {
      totalAmount,
      referralTotal,
      brandBonusTotal,
      dividendTotal,
      totalCount: paidRewards.length,
    }
  }

  // 处理退款（扣回已发放的奖励）
  static async processRefund(orderId: string) {
    const rewards = await prisma.reward.findMany({
      where: { orderId, status: 'paid' },
    })

    for (const reward of rewards) {
      // 扣回用户余额
      await prisma.user.update({
        where: { id: reward.userId },
        data: {
          balance: {
            decrement: reward.amount,
          },
        },
      })

      // 标记奖励为已退回
      await prisma.reward.update({
        where: { id: reward.id },
        data: { status: 'refunded' },
      })
    }
  }
}