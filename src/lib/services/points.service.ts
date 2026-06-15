import { prisma } from '@/lib/prisma'
import { POINTS_CONFIG } from '@/lib/constants'
import { logger } from '@/lib/logger'

export class PointsService {
  // 获取用户积分信息
  static async getUserPoints(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        totalPoints: true,
        unlockedPoints: true,
        lockedPoints: true,
      },
    })

    if (!user) {
      throw new Error('用户不存在')
    }

    return user
  }

  // 添加积分记录
  static async createPointsRecord(data: {
    userId: string
    type: 'earn' | 'spend' | 'transfer_in' | 'transfer_out' | 'reward' | 'refund'
    amount: number
    description?: string
    relatedUserId?: string
    sourceId?: string
  }) {
    const user = await this.getUserPoints(data.userId)

    // 更新用户总积分
    await prisma.user.update({
      where: { id: data.userId },
      data: {
        totalPoints: { increment: data.amount },
      },
    })

    // 创建积分记录（包含必填字段）
    return prisma.pointsRecord.create({
      data: {
        userId: data.userId,
        type: data.type,
        amount: data.amount,
        totalPoints: user.totalPoints + data.amount,
        unlockedPoints: user.unlockedPoints,
        lockedPoints: user.lockedPoints,
        description: data.description || '',
          relatedUserId: data.relatedUserId,
          sourceId: data.sourceId,
      },
    })
  }

  // 积分转账（内部使用）
  static async transferPoints(fromUserId: string, toUserId: string, amount: number, description: string) {
    // 验证转出方余额
    const fromUser = await this.getUserPoints(fromUserId)
    if (fromUser.unlockedPoints < amount) {
      throw new Error('可用积分不足')
    }

    // 计算手续费（如果有）
    const feeRate = (POINTS_CONFIG as any).TRANSFER_FEE_RATE || 0
    const feeAmount = Math.floor(amount * feeRate)
    const totalDeduction = amount + feeAmount

    // 使用事务确保原子性
    await prisma.$transaction(async (tx) => {
      // 原子扣减转出方积分（防并发透支）
      const fromResult = await tx.$queryRawUnsafe<{ count: number }[]>(`
        UPDATE "users"
        SET "unlocked_points" = "unlocked_points" - ${totalDeduction}
        WHERE id = '${fromUserId.replace(/'/g, "''")}' AND "unlocked_points" >= ${totalDeduction}
        RETURNING 1 as count
      `)

      if (fromResult.length === 0) {
        throw new Error('可用积分不足（包括手续费）')
      }

      // 原子增加接收方积分
      await tx.$queryRawUnsafe(`
        UPDATE "users"
        SET "unlocked_points" = "unlocked_points" + ${amount}
        WHERE id = '${toUserId.replace(/'/g, "''")}'
      `)

      // 查询用户信息用于创建记录
      const [toUser] = await tx.user.findMany({
        where: { id: toUserId },
        take: 1,
      })

      // 创建转出记录
      await tx.pointsRecord.create({
        data: {
          userId: fromUserId,
          type: 'transfer_out',
          amount: -totalDeduction,
          description: `转赠给用户 ${toUser?.nickname || toUser?.phone} (含手续费 ${feeAmount} 积分)`,
          totalPoints: fromUser.totalPoints - totalDeduction,
          unlockedPoints: fromUser.unlockedPoints - totalDeduction,
          lockedPoints: fromUser.lockedPoints,
          relatedUserId: toUserId,
        },
      })

      // 创建转入记录
      await tx.pointsRecord.create({
        data: {
          userId: toUserId,
          type: 'transfer_in',
          amount: amount,
          description: `收到来自用户的积分`,
          totalPoints: (toUser?.totalPoints || 0) + amount,
          unlockedPoints: (toUser?.unlockedPoints || 0) + amount,
          lockedPoints: toUser?.lockedPoints || 0,
          relatedUserId: fromUserId,
        },
      })
    })

    logger.info(`积分转账成功: ${fromUserId} -> ${toUserId}, 金额: ${amount}`)

    // 返回更新后的用户信息
    const [updatedFromUser] = await prisma.user.findMany({
      where: { id: fromUserId },
      select: { id: true, phone: true, nickname: true, totalPoints: true, unlockedPoints: true, lockedPoints: true },
      take: 1,
    })

    const [updatedToUser] = await prisma.user.findMany({
      where: { id: toUserId },
      select: { id: true, phone: true, nickname: true, totalPoints: true, unlockedPoints: true, lockedPoints: true },
      take: 1,
    })

    return {
      fromUser: updatedFromUser,
      toUser: updatedToUser,
      amount,
      feeAmount,
      totalDeduction,
    }
  }

  // 每日积分解锁（定时任务调用）
  static async dailyUnlock(): Promise<number> {
    const unlockSchedules = await prisma.pointsUnlockSchedule.findMany({
      where: {
        status: 'active',
        nextUnlockDate: { lte: new Date() },
      },
    })

    let count = 0
    for (const schedule of unlockSchedules) {
      const user = await this.getUserPoints(schedule.userId)
      const dailyAmount = Math.floor(schedule.remainingPoints * schedule.dailyUnlockRate)

      await prisma.$transaction(async (tx) => {
        // 增加可用积分
        await tx.user.update({
          where: { id: schedule.userId },
          data: {
            unlockedPoints: { increment: dailyAmount },
            lockedPoints: { decrement: dailyAmount },
          },
        })

        // 更新解锁计划进度
        const newCompletedDays = schedule.completedDays + 1
        const newRemaining = schedule.remainingPoints - dailyAmount
        await tx.pointsUnlockSchedule.update({
          where: { id: schedule.id },
          data: {
            completedDays: newCompletedDays,
            remainingPoints: newRemaining,
            unlockedPoints: { increment: dailyAmount },
            status: newCompletedDays >= schedule.totalDays ? 'completed' : 'active',
            nextUnlockDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        })

        // 创建积分记录
        await tx.pointsRecord.create({
          data: {
            userId: schedule.userId,
            type: 'earn',
            amount: dailyAmount,
            totalPoints: user.totalPoints + dailyAmount,
            unlockedPoints: user.unlockedPoints + dailyAmount,
            lockedPoints: Math.max(0, user.lockedPoints - dailyAmount),
            description: `积分解锁（第${newCompletedDays}天，每日${schedule.dailyUnlockRate * 100}%）`,
          },
        })
      })
      count++
    }

    logger.info(`积分解锁完成: ${count} 条记录已处理`)
    return count
  }
}
