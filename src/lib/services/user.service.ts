import { prisma } from '@/lib/prisma'
import { MEMBER_LEVELS } from '@/lib/constants'
import { PointsService } from './points.service'
import { getBusinessConfig } from '@/lib/config/business'
import { logger } from '@/lib/logger'

export class UserService {
  static async createUser(data: {
    phone: string
    passwordHash: string
    nickname?: string
    referrerId?: string
  }) {
    const { phone, passwordHash, nickname, referrerId } = data

    let parentId: string | null = null
    let position: number | null = null

    if (referrerId) {
      const placement = await this.findPlacementPosition(referrerId)
      parentId = placement.parentId
      position = placement.position
    }

    return prisma.user.create({
      data: {
        phone,
        passwordHash,
        nickname: nickname || `用户${phone.slice(-4)}`,
        referrerId,
        parentId,
        position,
        level: MEMBER_LEVELS.MEMBER,
      },
    })
  }

  static async findPlacementPosition(referrerId: string): Promise<{
    parentId: string
    position: number
  }> {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(referrerId)) {
      throw new Error(`推荐人 ID 格式无效：${referrerId}`)
    }

    const allUsers = await prisma.user.findMany({
      where: {
        OR: [
          { id: referrerId },
          { referrerId: referrerId },
        ],
      },
      select: {
        id: true,
        parentId: true,
        position: true,
      },
    })

    if (allUsers.length === 0) {
      return { parentId: referrerId, position: 1 }
    }

    const childrenMap = new Map<string, Set<number>>()

    for (const node of allUsers) {
      if (node.parentId) {
        if (!childrenMap.has(node.parentId)) {
          childrenMap.set(node.parentId, new Set())
        }
        childrenMap.get(node.parentId)!.add(node.position!)
      }
    }

    const queue: string[] = [referrerId]
    while (queue.length > 0) {
      const currentId = queue.shift()!
      const usedPositions = childrenMap.get(currentId) || new Set()
      
      for (let pos = 1; pos <= 3; pos++) {
        if (!usedPositions.has(pos)) {
          return { parentId: currentId, position: pos }
        }
      }
      
      const children = allUsers
        .filter(d => d.parentId === currentId)
        .sort((a, b) => (a.position || 0) - (b.position || 0))
      for (const child of children) {
        queue.push(child.id)
      }
    }

    return { parentId: referrerId, position: 1 }
  }

  static async getPlacementChain(userId: string, maxDepth: number = 10): Promise<string[]> {
    const chain: string[] = []
    let currentId = userId
    
    for (let i = 0; i < maxDepth; i++) {
      const user = await prisma.user.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      })
      
      if (!user?.parentId) break
      
      chain.push(user.parentId)
      currentId = user.parentId
    }
    
    return chain
  }

  static async checkAndUpgradeLevel(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })
    
    if (!user) return

    let newLevel = user.level

    const boxCount = await getBusinessConfig<number>('upgrade.distributor.box_count', 10)
    if (user.level < MEMBER_LEVELS.DISTRIBUTOR) {
      if (user.upgradeProductCount >= boxCount) {
        newLevel = MEMBER_LEVELS.DISTRIBUTOR
      }
    }

    const conditions = [
      { level: MEMBER_LEVELS.DIRECTOR, key: 'director' },
      { level: MEMBER_LEVELS.MANAGER, key: 'manager' },
      { level: MEMBER_LEVELS.SUPERVISOR, key: 'supervisor' },
      { level: MEMBER_LEVELS.PRESIDENT, key: 'president' },
      { level: MEMBER_LEVELS.BOARD, key: 'board' },
    ]

    for (const condition of conditions) {
      if (user.level < condition.level) {
        const requiredSales = await getBusinessConfig<number>(`upgrade.${condition.key}.sales_amount`, 0)
        if (user.directSalesAmount >= requiredSales) {
          newLevel = condition.level
        }
      }
    }

    if (newLevel > user.level) {
      await prisma.user.update({
        where: { id: userId },
        data: { level: newLevel },
      })

      if (newLevel >= MEMBER_LEVELS.DISTRIBUTOR && user.level < MEMBER_LEVELS.DISTRIBUTOR) {
        const pointsPerBox = await getBusinessConfig<number>('upgrade.points_per_box', 500)
        const pointsAmount = user.upgradeProductCount * pointsPerBox
        if (pointsAmount > 0) {
          await PointsService.createPointsRecord({
            userId,
            type: 'reward',
            amount: pointsAmount,
            description: `升级为经销商发放积分（${user.upgradeProductCount}件升级产品 × ${pointsPerBox}）`,
          })
          // v54 D: 创建积分释放计划（按日释放）
          const dailyUnlockRate = await getBusinessConfig<number>('upgrade.daily_unlock_rate', 0.01)
          const totalDays = Math.ceil(1 / dailyUnlockRate)
          const tomorrow = new Date()
          tomorrow.setHours(0, 0, 0, 0)
          tomorrow.setDate(tomorrow.getDate() + 1)
          await PointsService.createPointsUnlockSchedule({
            userId,
            orderId: '',
            totalPoints: pointsAmount,
            dailyUnlockRate,
            totalDays,
            nextUnlockDate: tomorrow,
          }).catch((err: unknown) => {
            logger.error('[v54 D] 创建积分释放计划失败', { userId, pointsAmount, error: String(err) })
          })
        }
      }

      if (user.referrerId && newLevel === MEMBER_LEVELS.DISTRIBUTOR && user.level < MEMBER_LEVELS.DISTRIBUTOR) {
        await prisma.user.update({
          where: { id: user.referrerId },
          data: {
            directDistributorCount: {
              increment: 1,
            },
          },
        })
      }
    }

    return newLevel
  }

  static async getReferrals(userId: string) {
    return prisma.user.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: 'desc' },
    })
  }

  static async getTeam(userId: string, maxDepth: number = 10) {
    const team: { id: string; level: number; depth: number }[] = []
    const queue: { id: string; depth: number }[] = [{ id: userId, depth: 0 }]
    
    while (queue.length > 0) {
      const { id, depth } = queue.shift()!
      
      if (depth >= maxDepth) continue
      
      const children = await prisma.user.findMany({
        where: { parentId: id },
        select: { id: true, level: true },
      })
      
      for (const child of children) {
        team.push({ id: child.id, level: child.level, depth: depth + 1 })
        queue.push({ id: child.id, depth: depth + 1 })
      }
    }
    
    return team
  }

  static async addDirectSales(userId: string, amount: number) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        directSalesAmount: {
          increment: amount,
        },
      },
    })
  }

  static async addUpgradeProductCount(userId: string, count: number = 1) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        upgradeProductCount: {
          increment: count,
        },
      },
    })
  }
}
