import { prisma } from '@/lib/prisma'
import { POINTS_CONFIG } from '@/lib/constants'

export class PointsService {
  // 发放积分（购买升级产品后）
  static async grantPoints(userId: string, orderId: string, amount: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) throw new Error('用户不存在')

    // 计算首次解锁积分（总额的1%）
    const firstUnlockAmount = Math.floor(amount * 0.01)
    const remainingLockedAmount = amount - firstUnlockAmount

    // 更新用户积分
    await prisma.user.update({
      where: { id: userId },
      data: {
        totalPoints: {
          increment: amount,
        },
        unlockedPoints: {
          increment: firstUnlockAmount,
        },
        lockedPoints: {
          increment: remainingLockedAmount,
        },
      },
    })

    // 创建积分获得记录
    await prisma.pointsRecord.create({
      data: {
        userId,
        type: 'earn',
        amount,
        totalPoints: user.totalPoints + amount,
        unlockedPoints: user.unlockedPoints + firstUnlockAmount,
        lockedPoints: user.lockedPoints + remainingLockedAmount,
        sourceId: orderId,
        description: '购买升级产品获得积分',
      },
    })

    // 创建首次解锁记录
    await prisma.pointsRecord.create({
      data: {
        userId,
        type: 'unlock',
        amount: firstUnlockAmount,
        totalPoints: user.totalPoints + amount,
        unlockedPoints: user.unlockedPoints + firstUnlockAmount,
        lockedPoints: user.lockedPoints + remainingLockedAmount,
        sourceId: orderId,
        description: '积分首次解锁',
      },
    })

    // 创建解锁计划
    await prisma.pointsUnlockSchedule.create({
      data: {
        userId,
        orderId,
        totalPoints: amount,
        unlockedPoints: firstUnlockAmount,
        remainingPoints: remainingLockedAmount,
        dailyUnlockRate: POINTS_CONFIG.UNLOCK_RATE,
        totalDays: POINTS_CONFIG.UNLOCK_DAYS,
        completedDays: 1, // 已完成1天（首次解锁）
        nextUnlockDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 明天继续解锁
      },
    })

    return amount
  }

  // 每日解锁积分
  static async dailyUnlock() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // 获取所有需要解锁的计划
    const schedules = await prisma.pointsUnlockSchedule.findMany({
      where: {
        status: 'active',
        nextUnlockDate: {
          lte: today,
        },
      },
    })

    for (const schedule of schedules) {
      // 计算每日固定解锁额度（原始总额的1%）
      const dailyUnlockAmount = Math.floor(schedule.totalPoints * schedule.dailyUnlockRate)
      const actualUnlock = Math.min(dailyUnlockAmount, schedule.remainingPoints)

      if (actualUnlock <= 0) continue

      // 更新用户积分
      const user = await prisma.user.findUnique({
        where: { id: schedule.userId },
      })

      if (!user) continue

      await prisma.user.update({
        where: { id: schedule.userId },
        data: {
          unlockedPoints: {
            increment: actualUnlock,
          },
          lockedPoints: {
            decrement: actualUnlock,
          },
        },
      })

      // 创建解锁记录
      await prisma.pointsRecord.create({
        data: {
          userId: schedule.userId,
          type: 'unlock',
          amount: actualUnlock,
          totalPoints: user.totalPoints,
          unlockedPoints: user.unlockedPoints + actualUnlock,
          lockedPoints: user.lockedPoints - actualUnlock,
          sourceId: schedule.orderId,
          description: `积分每日解锁 ${schedule.completedDays + 1}/${schedule.totalDays}`,
        },
      })

      // 更新解锁计划
      const newRemaining = schedule.remainingPoints - actualUnlock
      const newCompletedDays = schedule.completedDays + 1
      const isCompleted = newRemaining <= 0 || newCompletedDays >= schedule.totalDays

      await prisma.pointsUnlockSchedule.update({
        where: { id: schedule.id },
        data: {
          unlockedPoints: schedule.unlockedPoints + actualUnlock,
          remainingPoints: newRemaining,
          completedDays: newCompletedDays,
          status: isCompleted ? 'completed' : 'active',
          nextUnlockDate: isCompleted ? null : new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      })
    }

    return schedules.length
  }

  // 转赠积分
  static async transferPoints(fromUserId: string, toUserId: string, amount: number, feePercent: number = 10) {
    if (amount <= 0) throw new Error('转赠金额必须大于0')

    const fromUser = await prisma.user.findUnique({
      where: { id: fromUserId },
    })

    const toUser = await prisma.user.findUnique({
      where: { id: toUserId },
    })

    if (!fromUser) throw new Error('转出用户不存在')
    if (!toUser) throw new Error('接收用户不存在')
    
    // 计算手续费
    const feeAmount = Math.floor(amount * feePercent / 100)
    const totalDeduction = amount + feeAmount
    
    if (fromUser.unlockedPoints < totalDeduction) throw new Error('可用积分不足（包括手续费）')
    if (toUser.level < 1) throw new Error('接收用户必须是注册会员')

    // 扣除转出用户积分（包括手续费）
    await prisma.user.update({
      where: { id: fromUserId },
      data: {
        unlockedPoints: {
          decrement: totalDeduction,
        },
      },
    })

    // 增加接收用户积分
    await prisma.user.update({
      where: { id: toUserId },
      data: {
        unlockedPoints: {
          increment: amount,
        },
      },
    })

    // 创建转出记录
    await prisma.pointsRecord.create({
      data: {
        userId: fromUserId,
        type: 'transfer_out',
        amount: -totalDeduction,
        totalPoints: fromUser.totalPoints,
        unlockedPoints: fromUser.unlockedPoints - totalDeduction,
        lockedPoints: fromUser.lockedPoints,
        relatedUserId: toUserId,
        description: `转赠给用户 ${toUser.nickname || toUser.phone} (含手续费 ${feeAmount} 积分)`,
      },
    })

    // 创建转入记录
    await prisma.pointsRecord.create({
      data: {
        userId: toUserId,
        type: 'transfer_in',
        amount,
        totalPoints: toUser.totalPoints,
        unlockedPoints: toUser.unlockedPoints + amount,
        lockedPoints: toUser.lockedPoints,
        relatedUserId: fromUserId,
        description: `来自用户 ${fromUser.nickname || fromUser.phone} 的转赠`,
      },
    })

    return { fromUser, toUser, amount, feeAmount, totalDeduction }
  }

  // 作废积分（退款时）
  static async voidPoints(orderId: string) {
    const schedule = await prisma.pointsUnlockSchedule.findFirst({
      where: { orderId },
    })

    if (!schedule) return

    const user = await prisma.user.findUnique({
      where: { id: schedule.userId },
    })

    if (!user) return

    // 扣除剩余锁定积分
    if (schedule.remainingPoints > 0) {
      await prisma.user.update({
        where: { id: schedule.userId },
        data: {
          totalPoints: {
            decrement: schedule.remainingPoints,
          },
          lockedPoints: {
            decrement: schedule.remainingPoints,
          },
        },
      })

      // 创建作废记录
      await prisma.pointsRecord.create({
        data: {
          userId: schedule.userId,
          type: 'void',
          amount: -schedule.remainingPoints,
          totalPoints: user.totalPoints - schedule.remainingPoints,
          unlockedPoints: user.unlockedPoints,
          lockedPoints: user.lockedPoints - schedule.remainingPoints,
          sourceId: orderId,
          description: '订单退款，剩余积分作废',
        },
      })
    }

    // 如果已解锁积分被使用，从余额扣除
    const usedPoints = schedule.unlockedPoints
    if (usedPoints > 0) {
      await prisma.user.update({
        where: { id: schedule.userId },
        data: {
          balance: {
            decrement: usedPoints,
          },
        },
      })
    }

    // 更新解锁计划状态
    await prisma.pointsUnlockSchedule.update({
      where: { id: schedule.id },
      data: {
        status: 'cancelled',
        remainingPoints: 0,
      },
    })
  }

  // 获取用户积分记录
  static async getUserPointsRecords(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit

    const [records, total] = await Promise.all([
      prisma.pointsRecord.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.pointsRecord.count({
        where: { userId },
      }),
    ])

    return {
      records,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  // 获取用户积分统计
  static async getUserPointsStats(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) throw new Error('用户不存在')

    // 获取解锁计划
    const schedules = await prisma.pointsUnlockSchedule.findMany({
      where: { userId },
    })

    const activeSchedules = schedules.filter(s => s.status === 'active')
    const completedSchedules = schedules.filter(s => s.status === 'completed')

    return {
      total: user.totalPoints,
      unlocked: user.unlockedPoints,
      locked: user.lockedPoints,
      activeSchedules: activeSchedules.length,
      completedSchedules: completedSchedules.length,
    }
  }
}