import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { logOperation } from '@/lib/utils/operation-log'
import { getBusinessConfig } from '@/lib/config/business'
import { OrderNotificationService } from '@/lib/services/order-notification.service'

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
  // v55.1: 支持 tx 参数，允许在事务中调用以保证原子性
  static async createPointsRecord(
    data: {
      userId: string
      type: 'earn' | 'spend' | 'transfer_in' | 'transfer_out' | 'reward' | 'refund'
      amount: number
      description?: string
      relatedUserId?: string
      sourceId?: string
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? prisma
    // getUserPoints 是只读查询，不需要事务上下文
    const user = await this.getUserPoints(data.userId)

    // 更新用户总积分
    await client.user.update({
      where: { id: data.userId },
      data: {
        totalPoints: { increment: data.amount },
      },
    })

    // 创建积分记录（包含必填字段）
    return client.pointsRecord.create({
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
  static async transferPoints(fromUserId: string, toUserId: string, amount: number, _description: string) {
    // 验证转出方余额
    const fromUser = await this.getUserPoints(fromUserId)
    if (fromUser.unlockedPoints < amount) {
      throw new Error('可用积分不足')
    }

    // 计算手续费（如果有）
    const feeRate = await getBusinessConfig<number>('points.transfer_fee_percent', 10) / 100
    const feeAmount = Math.floor(amount * feeRate)
    const totalDeduction = amount + feeAmount

    // 使用事务确保原子性
    await prisma.$transaction(async (tx) => {
      // 原子扣减转出方积分（防并发透支）
      const fromResult = await tx.user.updateMany({
        where: {
          id: fromUserId,
          unlockedPoints: { gte: totalDeduction },
        },
        data: {
          unlockedPoints: { decrement: totalDeduction },
        },
      })

      if (fromResult.count === 0) {
        throw new Error('可用积分不足（包括手续费）')
      }

      // 原子增加接收方积分
      await tx.user.update({
        where: { id: toUserId },
        data: {
          unlockedPoints: { increment: amount },
        },
      })

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

  // v54 D: 创建积分释放计划（升级为经销商时调用）
  // v55.1: 支持 tx 参数，允许在事务中调用以保证原子性
  static async createPointsUnlockSchedule(
    data: {
      userId: string
      orderId: string | null
      totalPoints: number
      dailyUnlockRate: number
      totalDays: number
      nextUnlockDate: Date
    },
    tx?: Prisma.TransactionClient,
  ): Promise<{ id: string }> {
    const client = tx ?? prisma
    // 将积分锁定到 lockedPoints，dailyUnlock 会逐步释放到 unlockedPoints
    await client.user.update({
      where: { id: data.userId },
      data: { lockedPoints: { increment: data.totalPoints } },
    })

    return client.pointsUnlockSchedule.create({
      data: {
        userId: data.userId,
        orderId: data.orderId || '',
        totalPoints: data.totalPoints,
        unlockedPoints: 0,
        remainingPoints: data.totalPoints,
        dailyUnlockRate: data.dailyUnlockRate,
        totalDays: data.totalDays,
        completedDays: 0,
        status: 'active',
        nextUnlockDate: data.nextUnlockDate,
      },
      select: { id: true },
    })
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
            // 修复：type 必须是 'unlock'，前端 FILTER_TABS 的「解锁」tab 才过滤得到
            type: 'unlock',
            amount: dailyAmount,
            totalPoints: user.totalPoints + dailyAmount,
            unlockedPoints: user.unlockedPoints + dailyAmount,
            lockedPoints: Math.max(0, user.lockedPoints - dailyAmount),
            description: `积分解锁（第${newCompletedDays}天，每日${schedule.dailyUnlockRate * 100}%）`,
          },
        })
      })
      count++

      // v57.4: 事务后发通知（事务内发通知会被 GC 回收，参考 v46.7/v46.10 教训）
      await OrderNotificationService.notifyPointsUnlock({
        userId: schedule.userId,
        unlockAmount: dailyAmount,
        newUnlockedPoints: user.unlockedPoints + dailyAmount,
        newLockedPoints: Math.max(0, user.lockedPoints - dailyAmount),
        completedDays: schedule.completedDays + 1,
      })
    }

    logger.info(`积分解锁完成: ${count} 条记录已处理`)
    return count
  }

  // 积分作废（管理员操作）
  static async voidPoints(adminId: string, userId: string, amount: number, reason: string) {
    // 1. 必填校验（事务前）
    if (typeof amount !== 'number' || amount <= 0) {
      throw new Error('作废积分必须大于0')
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      throw new Error('作废原因必填')
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, unlockedPoints: true, totalPoints: true, lockedPoints: true },
    })

    if (!user) {
      throw new Error('用户不存在')
    }

    // 2. 事务：防并发透支 + 写流水
    const result = await prisma.$transaction(async (tx) => {
      // 防并发透支：updateMany + where 条件
      const updateResult = await tx.user.updateMany({
        where: {
          id: userId,
          unlockedPoints: { gte: amount },
        },
        data: {
          unlockedPoints: { decrement: amount },
          totalPoints: { decrement: amount },
        },
      })

      if (updateResult.count === 0) {
        throw new Error('积分不足')
      }

      // 查询作废后的用户积分
      const updatedUser = await tx.user.findUnique({
        where: { id: userId },
        select: { totalPoints: true, unlockedPoints: true, lockedPoints: true },
      })

      // 写积分流水
      await tx.pointsRecord.create({
        data: {
          userId,
          type: 'void',
          amount: -amount,
          totalPoints: updatedUser!.totalPoints,
          unlockedPoints: updatedUser!.unlockedPoints,
          lockedPoints: updatedUser!.lockedPoints,
          description: `积分作废：${reason}`,
        },
      })

      return {
        oldValue: { unlockedPoints: user.unlockedPoints, totalPoints: user.totalPoints },
        newValue: { unlockedPoints: updatedUser!.unlockedPoints, totalPoints: updatedUser!.totalPoints },
      }
    })

    // 3. 操作日志（不阻塞主流程）
    await logOperation({
      userId: adminId,
      action: 'UPDATE',
      module: 'user',
      targetId: userId,
      oldValue: result.oldValue,
      newValue: result.newValue,
    })

    // v54 阶段4: 通知用户积分作废
    await OrderNotificationService.notifyPointsVoid({
      userId,
      amount,
      reason,
      remainingPoints: result.newValue.unlockedPoints,
      operatorId: adminId,
    })

    logger.info(`积分作废成功: userId=${userId}, amount=${amount}, reason=${reason}`)

    return { userId, amount, reason, ...result.newValue }
  }
}
