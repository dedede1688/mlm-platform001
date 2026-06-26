import { prisma } from '@/lib/prisma'
import { MEMBER_LEVELS } from '@/lib/constants'
import { getBusinessConfig } from '@/lib/config/business'


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

      // 3. v50 B: 计算总订单金额 + 5 级独立池（替代 v1 单池累加算法）
      const totalOrderAmount = paidOrders.reduce((sum, order) => sum + order.payAmount, 0)

      // 读取 5 个独立池比例
      const [
        directorRate, managerRate, supervisorRate, presidentRate, boardRate,
      ] = await Promise.all([
        getBusinessConfig<number>('dividend.director.rate', 0.05),
        getBusinessConfig<number>('dividend.manager.rate', 0.05),
        getBusinessConfig<number>('dividend.supervisor.rate', 0.05),
        getBusinessConfig<number>('dividend.president.rate', 0.05),
        getBusinessConfig<number>('dividend.board.rate', 0.05),
      ])

      // 读取 5 个 include_upstream 开关
      const [
        directorInclude, managerInclude, supervisorInclude, presidentInclude, boardInclude,
      ] = await Promise.all([
        getBusinessConfig<boolean>('dividend.director.include_upstream', false),
        getBusinessConfig<boolean>('dividend.manager.include_upstream', false),
        getBusinessConfig<boolean>('dividend.supervisor.include_upstream', false),
        getBusinessConfig<boolean>('dividend.president.include_upstream', false),
        getBusinessConfig<boolean>('dividend.board.include_upstream', false),
      ])

      // 5 级独立池总额（v2: 每级算自己的池，不累加）
      const poolsTotal: Record<number, number> = {
        3: Math.round(totalOrderAmount * directorRate * 100) / 100,
        4: Math.round(totalOrderAmount * managerRate * 100) / 100,
        5: Math.round(totalOrderAmount * supervisorRate * 100) / 100,
        6: Math.round(totalOrderAmount * presidentRate * 100) / 100,
        7: Math.round(totalOrderAmount * boardRate * 100) / 100,
      }

      const totalDividendPool = Object.values(poolsTotal).reduce((sum, v) => sum + v, 0)

      if (totalDividendPool <= 0) {
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
          dividendPool: totalDividendPool,
          totalOrders: paidOrders.length,
          totalOrderAmount,
          eligibleUsers: 0,
          distributedUsers: 0,
          details: [],
          message: '暂无符合条件的分红用户',
        }
      }

      console.log(`[分红结算 v2] 5级独立池总额: ¥${totalDividendPool}, 参与用户: ${eligibleUsers.length}人`)

      // 5. v50 B: 5 级独立池分配算法（替代 v1 累加算法）
      // 每个池独立计算：pool_total = totalOrderAmount × rate
      // include_upstream=true 时，本级 + 更高级（不含董事，董事池独占）参与平分
      // 用户可同时拿多个池的分红（如总监 S 可同时拿主任池+经理池+总监池+董事池）
      const poolConfig: Record<number, { total: number; includeUpstream: boolean }> = {
        3: { total: poolsTotal[3], includeUpstream: directorInclude },
        4: { total: poolsTotal[4], includeUpstream: managerInclude },
        5: { total: poolsTotal[5], includeUpstream: supervisorInclude },
        6: { total: poolsTotal[6], includeUpstream: presidentInclude },
        7: { total: poolsTotal[7], includeUpstream: boardInclude },
      }

      // 用户累计分红：{ userId: { level: perPerson } }
      const userDividends: Record<string, Record<number, number>> = {}

      // 按从高到低处理（董事→总裁→总监→经理→主任）
      for (const level of [7, 6, 5, 4, 3]) {
        const config = poolConfig[level]
        if (config.total <= 0) continue

        let eligibleLevels: number[]
        if (level === 7) {
          // 董事池永远只覆盖董事
          eligibleLevels = [7]
        } else if (config.includeUpstream) {
          // 包含上级：本级 + 更高级（不含董事，因为董事池独占）
          eligibleLevels = []
          for (let l = level; l <= 6; l++) {
            eligibleLevels.push(l)
          }
        } else {
          // 仅本级
          eligibleLevels = [level]
        }

        const candidates = eligibleUsers.filter(u => eligibleLevels.includes(u.level))
        if (candidates.length === 0) continue

        const perPerson = Math.round((config.total / candidates.length) * 100) / 100

        for (const user of candidates) {
          if (!userDividends[user.id]) userDividends[user.id] = {}
          userDividends[user.id][level] = perPerson
        }
      }

      // 6. 计算每个用户的总分红（多个池的 perPerson 之和）
      const userTotalDividends: Record<string, number> = {}
      for (const [userId, levelMap] of Object.entries(userDividends)) {
        userTotalDividends[userId] = Math.round(Object.values(levelMap).reduce((sum, amt) => sum + amt, 0) * 100) / 100
      }

      console.log('[分红结算 v2] 用户分红明细:', userTotalDividends)

      // 7. 获取一个订单ID用于分红记录关联（取第一个已支付订单）
      const referenceOrderId = paidOrders.length > 0 ? paidOrders[0].id : ''

      // 8. 为每个用户创建分红记录并更新余额（v50 B: 用 userTotalDividends 替代 levelDividendPerPerson）
      const details = []
      for (const user of eligibleUsers) {
        const dividendAmount = userTotalDividends[user.id] || 0

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
              totalPool: totalDividendPool,
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
              earningsAvailable: {
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
              description: `每日分红结算（v2 5级独立池），发放 ¥${dividendAmount}，分红 ID：${dividendRecord.id}，等级：${this.LEVEL_NAMES[user.level] || '未知'}`,
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
        dividendPool: totalDividendPool,
        totalOrders: paidOrders.length,
        totalOrderAmount,
        eligibleUsers: eligibleUsers.length,
        distributedUsers: details.length,
        details,
        message: '分红结算成功（v2 5级独立池）',
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