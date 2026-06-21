import { prisma } from '@/lib/prisma'
import { MEMBER_LEVELS, REWARD_RATES } from '@/lib/constants'


export class DividendService {
  // 分红等级配置：从主任(3)到董事(7)
  private static DIVIDEND_LEVELS = [3, 4, 5, 6, 7] // 主任、经理、总监、总裁、董事

  private static LEVEL_NAMES: Record<number, string> = {
    3: '主任',
    4: '经理',
    5: '总监',
    6: '总裁',
    7: '董事',
  }

  // 执行每日分红结算
  static async settleDailyDividends() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)

    // 使用事务确保数据一致性
    return await prisma.$transaction(async (tx) => {
      // 1. 检查今日是否已结算
      const existingDividends = await tx.dividend.findFirst({
        where: {
          dividendDate: {
            gte: today,
            lte: todayEnd,
          },
        },
      })

      if (existingDividends) {
        throw new Error('今日分红已结算，不可重复结算')
      }

      // 2. 检查今日是否已有reward记录（防止重复发放）
      const existingRewards = await tx.reward.findFirst({
        where: {
          type: 'dividend',
          createdAt: {
            gte: today,
            lte: todayEnd,
          },
        },
      })

      if (existingRewards) {
        throw new Error('今日分红奖励已发放，不可重复发放')
      }

      // 2. 获取当日所有已支付订单
      const paidOrders = await tx.order.findMany({
        where: {
          status: 'paid',
          paidAt: {
            gte: today,
            lte: todayEnd,
          },
        },
      })

      // 3. 计算分红池（已支付订单总额的5%）
      const totalOrderAmount = paidOrders.reduce((sum, order) => sum + order.payAmount, 0)
      const dividendPool = Math.round(totalOrderAmount * REWARD_RATES.DIVIDEND * 100) / 100

      if (dividendPool <= 0) {
        return {
          dividendPool: 0,
          totalOrders: paidOrders.length,
          totalOrderAmount,
          eligibleUsers: 0,
          distributedUsers: 0,
          details: [],
          message: '今日无分红池金额',
        }
      }

      // 4. 获取所有等级 >= 3(主任)的用户快照
      const eligibleUsers = await tx.user.findMany({
        where: {
          level: {
            gte: MEMBER_LEVELS.DIRECTOR, // >= 3
          },
          status: 'active',
        },
        select: {
          id: true,
          phone: true,
          nickname: true,
          level: true,
        },
      })

      if (eligibleUsers.length === 0) {
        return {
          dividendPool,
          totalOrders: paidOrders.length,
          totalOrderAmount,
          eligibleUsers: 0,
          distributedUsers: 0,
          details: [],
          message: '暂无符合条件的分红用户',
        }
      }

      // 5. 按等级分组统计人数
      const levelCounts = new Map<number, number>()
      for (const user of eligibleUsers) {
        levelCounts.set(user.level, (levelCounts.get(user.level) || 0) + 1)
      }

      console.log(`[分红结算] 分红池: ¥${dividendPool}, 参与用户: ${eligibleUsers.length}人`)
      console.log(`[分红结算] 等级分布:`, Object.fromEntries(levelCounts))

      // 6. 累加分配算法
      // 算法说明：
      //   设各级别人数为 Z(主任), M(经理), D(总监), P(总裁), B(董事)
      //   主任每人分红 = 分红池 / (Z + M + D + P + B)
      //   经理每人分红 = 主任分红 + 分红池 / (M + D + P + B)
      //   总监每人分红 = 经理分红 + 分红池 / (D + P + B)
      //   总裁每人分红 = 总监分红 + 分红池 / (P + B)
      //   董事每人分红 = 总裁分红 + 分红池 / B

      const levelDividendPerPerson = new Map<number, number>()
      let cumulativeDividend = 0

      for (const level of this.DIVIDEND_LEVELS) {
        // 计算该级别及以上的人数总和
        let countAbove = 0
        for (const [l, count] of levelCounts) {
          if (l >= level) {
            countAbove += count
          }
        }

        if (countAbove > 0) {
          const levelShare = dividendPool / countAbove
          cumulativeDividend += levelShare
          levelDividendPerPerson.set(level, Math.round(cumulativeDividend * 100) / 100)
        }
      }

      console.log('[分红结算] 各级别每人分红:', Object.fromEntries(levelDividendPerPerson))

      // 7. 获取一个订单ID用于分红记录关联（取第一个已支付订单）
      const referenceOrderId = paidOrders.length > 0 ? paidOrders[0].id : ''

      // 8. 为每个用户创建分红记录并更新余额
      const details = []
      for (const user of eligibleUsers) {
        const dividendAmount = levelDividendPerPerson.get(user.level) || 0

        if (dividendAmount > 0) {
          // 查询用户当前余额（事务内）
          const currentUser = await tx.user.findUnique({
            where: { id: user.id },
            select: { balance: true, frozenBalance: true },
          })

          // 创建分红记录
          const dividendRecord = await tx.dividend.create({
            data: {
              userId: user.id,
              orderId: referenceOrderId,
              amount: dividendAmount,
              userLevel: user.level,
              totalPool: dividendPool,
              dividendDate: new Date(),
            },
          })

          // 更新用户余额
          await tx.user.update({
            where: { id: user.id },
            data: {
              balance: {
                increment: dividendAmount,
              },
            },
          })

          // 记录余额流水
          await tx.balanceRecord.create({
            data: {
              userId: user.id,
              type: 'daily_dividend',
              sourceType: 'dividend',
              sourceId: dividendRecord.id,
              amount: +dividendAmount,
              balance: currentUser!.balance + dividendAmount,
              frozenBalance: currentUser!.frozenBalance,
              description: `每日分红结算，发放 ¥${dividendAmount}，分红 ID：${dividendRecord.id}，等级：${this.LEVEL_NAMES[user.level] || '未知'}`,
            },
          })

          // 同时创建 reward 记录（type='dividend'）
          await tx.reward.create({
            data: {
              userId: user.id,
              type: 'dividend',
              orderId: referenceOrderId,
              amount: dividendAmount,
              status: 'paid',
            },
          })

          details.push({
            userId: user.id,
            phone: user.phone,
            nickname: user.nickname,
            level: user.level,
            levelName: this.LEVEL_NAMES[user.level] || '未知',
            dividendAmount,
          })
        }
      }

      return {
        dividendPool,
        totalOrders: paidOrders.length,
        totalOrderAmount,
        eligibleUsers: eligibleUsers.length,
        distributedUsers: details.length,
        details,
        message: '分红结算成功',
      }
    })
  }

  // 获取用户的分红记录
  static async getUserDividends(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit

    const [dividends, total] = await Promise.all([
      prisma.dividend.findMany({
        where: { userId },
        orderBy: { dividendDate: 'desc' },
        skip,
        take: limit,
      }),
      prisma.dividend.count({ where: { userId } }),
    ])

    return {
      dividends,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  // 获取分红统计信息
  static async getDividendStats(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) throw new Error('用户不存在')

    // 获取用户的分红总额
    const totalDividends = await prisma.dividend.aggregate({
      where: { userId },
      _sum: { amount: true },
    })

    // 获取最近一次分红
    const lastDividend = await prisma.dividend.findFirst({
      where: { userId },
      orderBy: { dividendDate: 'desc' },
    })

    return {
      totalAmount: totalDividends._sum.amount || 0,
      lastDividendDate: lastDividend?.dividendDate || null,
      lastAmount: lastDividend?.amount || 0,
      totalCount: await prisma.dividend.count({ where: { userId } }),
    }
  }

  // 检查今日是否已结算分红
  static async checkTodaySettlement() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)

    const existingDividends = await prisma.dividend.findFirst({
      where: {
        dividendDate: {
          gte: today,
          lte: todayEnd,
        },
      },
    })

    return !!existingDividends
  }

  // 获取今日分红统计
  static async getTodayDividendSummary() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)

    const [todayDividends, eligibleUsers] = await Promise.all([
      prisma.dividend.findMany({
        where: {
          dividendDate: {
            gte: today,
            lte: todayEnd,
          },
        },
        include: {
          user: {
            select: {
              phone: true,
              nickname: true,
              level: true,
            },
          },
        },
      }),
      prisma.user.count({
        where: {
          level: {
            gte: MEMBER_LEVELS.DIRECTOR,
          },
          status: 'active',
        },
      }),
    ])

    const totalAmount = todayDividends.reduce((sum, d) => sum + d.amount, 0)
    const distributedUsers = todayDividends.length

    return {
      totalAmount,
      distributedUsers,
      eligibleUsers,
      isSettled: distributedUsers > 0,
      details: todayDividends,
    }
  }
}