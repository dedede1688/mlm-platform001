import { prisma } from '@/lib/prisma'
import { MEMBER_LEVELS, UPGRADE_CONDITIONS } from '@/lib/constants'
import { PointsService } from './points.service'

export class UserService {
  // 创建用户
  static async createUser(data: {
    phone: string
    passwordHash: string
    nickname?: string
    referrerId?: string
  }) {
    const { phone, passwordHash, nickname, referrerId } = data

    // 如果有推荐人，处理安置关系
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

  // 查找安置位置（三三复制）- 优化版：一次查询获取子树
  static async findPlacementPosition(referrerId: string): Promise<{
    parentId: string
    position: number
  }> {
    // 一次性获取该推荐人下所有已有安置关系的用户
    // 使用递归查询获取所有后代
    const allDescendants = await prisma.$queryRaw<Array<{ id: string; parentId: string | null; position: number }>>`
      WITH RECURSIVE subtree AS (
        SELECT id, "parentId", position
        FROM "User"
        WHERE id = ${referrerId}::uuid
        UNION ALL
        SELECT u.id, u."parentId", u.position
        FROM "User" u
        INNER JOIN subtree s ON u."parentId" = s.id
      )
      SELECT id, "parentId", position FROM subtree
    `

    // 构建节点子节点映射
    const childrenMap = new Map<string, Set<number>>()
    const nodeIds = new Set<string>()
    
    for (const node of allDescendants) {
      nodeIds.add(node.id)
      if (node.parentId) {
        if (!childrenMap.has(node.parentId)) {
          childrenMap.set(node.parentId, new Set())
        }
        childrenMap.get(node.parentId)!.add(node.position)
      }
    }

    // BFS 查找空位（纯内存操作）
    const queue: string[] = [referrerId]
    while (queue.length > 0) {
      const currentId = queue.shift()!
      const usedPositions = childrenMap.get(currentId) || new Set()
      
      for (let pos = 1; pos <= 3; pos++) {
        if (!usedPositions.has(pos)) {
          return { parentId: currentId, position: pos }
        }
      }
      
      // 将子节点加入队列
      const children = allDescendants
        .filter(d => d.parentId === currentId)
        .sort((a, b) => a.position - b.position)
      for (const child of children) {
        queue.push(child.id)
      }
    }

    return { parentId: referrerId, position: 1 }
  }

  // 获取用户的安置链
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

  // 检查并升级用户等级
  static async checkAndUpgradeLevel(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })
    
    if (!user) return

    let newLevel = user.level

    // 检查经销商升级：购买10件升级产品
    if (user.level < MEMBER_LEVELS.DISTRIBUTOR) {
      if (user.upgradeProductCount >= 10) {
        newLevel = MEMBER_LEVELS.DISTRIBUTOR
      }
    }

    // 检查主任及以上升级：基于直推经销商数量或销售额
    // 注意：即使当前等级低于经销商，只要满足直推条件也可以直接升级
    const conditions = [
      { level: MEMBER_LEVELS.DIRECTOR, ...UPGRADE_CONDITIONS.DIRECTOR },
      { level: MEMBER_LEVELS.MANAGER, ...UPGRADE_CONDITIONS.MANAGER },
      { level: MEMBER_LEVELS.SUPERVISOR, ...UPGRADE_CONDITIONS.SUPERVISOR },
      { level: MEMBER_LEVELS.PRESIDENT, ...UPGRADE_CONDITIONS.PRESIDENT },
      { level: MEMBER_LEVELS.BOARD, ...UPGRADE_CONDITIONS.BOARD },
    ]

    for (const condition of conditions) {
      if (user.level < condition.level) {
        const meetsDistributorCount = user.directDistributorCount >= condition.directDistributors
        const meetsSalesAmount = user.directSalesAmount >= condition.directSales
        if (meetsDistributorCount || meetsSalesAmount) {
          newLevel = condition.level
        }
      }
    }

    // 只允许升级，不允许降级
    if (newLevel > user.level) {
      await prisma.user.update({
        where: { id: userId },
        data: { level: newLevel },
      })

      // 升级为经销商时一次性发放积分（10件升级产品 × 500 = 5000积分）
      if (newLevel >= MEMBER_LEVELS.DISTRIBUTOR && user.level < MEMBER_LEVELS.DISTRIBUTOR) {
        const pointsAmount = user.upgradeProductCount * 500
        if (pointsAmount > 0) {
          await PointsService.grantPoints(userId, '', pointsAmount)
        }
      }

      // 更新推荐人的直推统计：当用户升级跨越经销商等级时增加计数
      if (user.referrerId && newLevel >= MEMBER_LEVELS.DISTRIBUTOR && user.level < MEMBER_LEVELS.DISTRIBUTOR) {
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

  // 获取用户的直推列表
  static async getReferrals(userId: string) {
    return prisma.user.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: 'desc' },
    })
  }

  // 获取用户的团队（安置链下的所有人）
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

  // 更新用户直推销售额
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

  // 增加升级产品购买计数
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
