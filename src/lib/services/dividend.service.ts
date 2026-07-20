import { prisma } from '@/lib/prisma'
import { MEMBER_LEVELS, BALANCE_SELECT } from '@/lib/constants'
import { getBusinessConfig } from '@/lib/config/business'
import { format4FieldDelta } from '@/lib/utils/balance-record-desc'
import { logger } from '@/lib/logger'
import { randomUUID } from 'crypto'


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

  // ========================================
  // 每日快照：只生成 dividend 明细（settled=false），不入账
  // ========================================
  static async snapshotDailyDividends() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)

    return await prisma.$transaction(async (tx) => {
      // 1. 检查今日是否已快照（幂等：同一日不重复生成明细）
      const existingDividends = await tx.dividend.findFirst({
        where: {
          dividendDate: {
            gte: today,
            lte: todayEnd,
          },
        },
      })

      if (existingDividends) {
        throw new Error('今日分红已快照，不可重复生成')
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

      // 3. v50 B: 计算总订单金额 + 5 级独立池
      const totalOrderAmount = paidOrders.reduce((sum, order) => sum + order.payAmount, 0)

      const [
        directorRate, managerRate, supervisorRate, presidentRate, boardRate,
      ] = await Promise.all([
        getBusinessConfig<number>('dividend.director.rate', 0.05),
        getBusinessConfig<number>('dividend.manager.rate', 0.05),
        getBusinessConfig<number>('dividend.supervisor.rate', 0.05),
        getBusinessConfig<number>('dividend.president.rate', 0.05),
        getBusinessConfig<number>('dividend.board.rate', 0.05),
      ])

      const [
        directorInclude, managerInclude, supervisorInclude, presidentInclude, boardInclude,
      ] = await Promise.all([
        getBusinessConfig<boolean>('dividend.director.include_upstream', false),
        getBusinessConfig<boolean>('dividend.manager.include_upstream', false),
        getBusinessConfig<boolean>('dividend.supervisor.include_upstream', false),
        getBusinessConfig<boolean>('dividend.president.include_upstream', false),
        getBusinessConfig<boolean>('dividend.board.include_upstream', false),
      ])

      // 5 级独立池总额
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
            gte: MEMBER_LEVELS.DIRECTOR,
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

      logger.info(`[分红快照 v3] 5级独立池总额: ¥${totalDividendPool}, 参与用户: ${eligibleUsers.length}人`)

      // 5. v50 B: 5 级独立池分配算法
      const poolConfig: Record<number, { total: number; includeUpstream: boolean }> = {
        3: { total: poolsTotal[3], includeUpstream: directorInclude },
        4: { total: poolsTotal[4], includeUpstream: managerInclude },
        5: { total: poolsTotal[5], includeUpstream: supervisorInclude },
        6: { total: poolsTotal[6], includeUpstream: presidentInclude },
        7: { total: poolsTotal[7], includeUpstream: boardInclude },
      }

      const userDividends: Record<string, Record<number, number>> = {}

      for (const level of [7, 6, 5, 4, 3]) {
        const config = poolConfig[level]
        if (config.total <= 0) continue

        let eligibleLevels: number[]
        if (level === 7) {
          eligibleLevels = [7]
        } else if (config.includeUpstream) {
          eligibleLevels = []
          for (let l = level; l <= 6; l++) {
            eligibleLevels.push(l)
          }
        } else {
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

      // 6. 计算每个用户的总分红
      const userTotalDividends: Record<string, number> = {}
      for (const [userId, levelMap] of Object.entries(userDividends)) {
        userTotalDividends[userId] = Math.round(Object.values(levelMap).reduce((sum, amt) => sum + amt, 0) * 100) / 100
      }

      logger.info('[分红快照 v3] 用户分红明细:', userTotalDividends)

      // 7. 获取一个订单ID用于分红记录关联
      const referenceOrderId = paidOrders.length > 0 ? paidOrders[0].id : ''

      // 8. 为每个用户创建分红记录（settled=false，不入账）
      const details = []
      for (const user of eligibleUsers) {
        const dividendAmount = userTotalDividends[user.id] || 0

        if (dividendAmount > 0) {
          // 只创建 dividend 记录，settled=false（等待周结入账）
          await tx.dividend.create({
            data: {
              userId: user.id,
              orderId: referenceOrderId,
              amount: dividendAmount,
              userLevel: user.level,
              totalPool: totalDividendPool,
              dividendDate: new Date(),
              settled: false,
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
        message: '分红快照成功（v3 周结模式，明细已生成，待周结入账）',
      }
    })
  }

  // ========================================
  // 每周结算：把"未结算"明细统一入账 + 幂等标记
  // ========================================
  static async settleWeeklyDividends() {
    return await prisma.$transaction(async (tx) => {
      // 1. 获取所有未结算的分红明细
      const unsettledDividends = await tx.dividend.findMany({
        where: { settled: false },
        orderBy: { userId: 'asc' },
      })

      if (unsettledDividends.length === 0) {
        return {
          batchId: null,
          totalAmount: 0,
          totalDividends: 0,
          distributedUsers: 0,
          details: [],
          message: '无待结算的分红明细',
        }
      }

      // 2. 生成结算批次ID（幂等标识）
      const batchId = randomUUID()
      const settleDate = new Date()

      // 3. 按用户分组
      const userDividendMap: Record<string, typeof unsettledDividends> = {}
      for (const dividend of unsettledDividends) {
        if (!userDividendMap[dividend.userId]) {
          userDividendMap[dividend.userId] = []
        }
        userDividendMap[dividend.userId].push(dividend)
      }

      const details = []
      let totalAmount = 0

      // 4. 逐用户入账
      for (const [userId, dividends] of Object.entries(userDividendMap)) {
        const userTotal = Math.round(
          dividends.reduce((sum, d) => sum + d.amount, 0) * 100
        ) / 100

        if (userTotal <= 0) continue

        // 4a. 获取用户当前余额（事务内）
        const currentUser = await tx.user.findUnique({
          where: { id: userId },
          select: BALANCE_SELECT,
        })

        if (!currentUser) {
          logger.warn(`[周结] 用户 ${userId} 不存在，跳过`)
          continue
        }

        // 4b. 更新用户可提现收益（资金底座: 分红只进 earningsAvailable）
        await tx.user.update({
          where: { id: userId },
          data: {
            earningsAvailable: { increment: userTotal },
          },
        })

        // 4c. 记录余额流水（一条汇总记录）
        const dividendIds = dividends.map(d => d.id)
        const afterDividend = {
          consumeBalance: currentUser.consumeBalance,
          earningsAvailable: currentUser.earningsAvailable + userTotal,
          earningsPending: currentUser.earningsPending,
          earningsVoided: currentUser.earningsVoided,
        }
        await tx.balanceRecord.create({
          data: {
            userId,
            type: 'daily_dividend',
            sourceType: 'dividend',
            sourceId: batchId,
            amount: +userTotal,
            balance: currentUser.balance,
            frozenBalance: currentUser.frozenBalance,
            description: `周结分红入账，批次：${batchId}，发放 ¥${userTotal}，可提现收益增加，余额不变，包含 ${dividends.length} 条明细：${dividendIds.join(',')}${format4FieldDelta(currentUser, afterDividend)}`,
          },
        })

        // 4d. 为每条分红明细创建 reward 记录（orderId 必填）
        for (const dividend of dividends) {
          await tx.reward.create({
            data: {
              userId,
              type: 'dividend',
              orderId: dividend.orderId,
              amount: dividend.amount,
              status: 'paid',
            },
          })
        }

        // 4e. 标记这些分红明细为已结算
        await tx.dividend.updateMany({
          where: { id: { in: dividendIds } },
          data: {
            settled: true,
            settleBatchId: batchId,
            settleDate,
          },
        })

        totalAmount = Math.round((totalAmount + userTotal) * 100) / 100

        details.push({
          userId,
          amount: userTotal,
          dividendCount: dividends.length,
        })
      }

      logger.info(`[周结 v3] 批次 ${batchId} 结算完成，总金额 ¥${totalAmount}，用户 ${details.length} 人`)

      return {
        batchId,
        totalAmount,
        totalDividends: unsettledDividends.length,
        distributedUsers: details.length,
        details,
        message: `周结分红入账成功（批次 ${batchId}），共 ${unsettledDividends.length} 条明细，${details.length} 位用户`,
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

    const totalDividends = await prisma.dividend.aggregate({
      where: { userId },
      _sum: { amount: true },
    })

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

  // 检查今日是否已快照分红
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

  // 获取今日分红快照摘要
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
    const settledCount = todayDividends.filter(d => d.settled).length

    return {
      totalAmount,
      distributedUsers,
      eligibleUsers,
      isSettled: distributedUsers > 0,
      isSnapshotted: distributedUsers > 0,
      settledCount,
      unsettledCount: distributedUsers - settledCount,
      details: todayDividends,
    }
  }
}
