import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { MEMBER_LEVELS } from '@/lib/constants'
import { PointsService } from './points.service'
import { LevelSnapshotService } from './level-snapshot.service'
import { getBusinessConfig } from '@/lib/config/business'
import type { Prisma } from '@prisma/client'
export interface UserListParams {
  page: number
  pageSize: number
  level?: string
  search?: string
  status?: string
  startDate?: string
  endDate?: string
  sortBy?: string
  sortOrder?: string
}

export interface TreeNode {
  id: string
  phone: string
  nickname: string | null
  level: number
  children: TreeNode[]
}

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
      throw new Error(`推荐�?ID 格式无效�?{referrerId}`)
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

  static async checkAndUpgradeLevel(userId: string, sourceOrderId?: string) {
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
      // v55.1: 常量在事务外预计算，事务内只�?DB 操作
      const pointsPerBox = await getBusinessConfig<number>('upgrade.points_per_box', 500)
      const pointsAmount = user.upgradeProductCount * pointsPerBox
      const dailyUnlockRate = pointsAmount > 0
        ? await getBusinessConfig<number>('upgrade.daily_unlock_rate', 0.01)
        : 0
      const totalDays = dailyUnlockRate > 0 ? Math.ceil(1 / dailyUnlockRate) : 0
      const tomorrow = new Date()
      tomorrow.setHours(0, 0, 0, 0)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const willCreateDistributorPoints = newLevel >= MEMBER_LEVELS.DISTRIBUTOR && user.level < MEMBER_LEVELS.DISTRIBUTOR && pointsAmount > 0
      const normalizedSourceOrderId = sourceOrderId?.trim()
      if (willCreateDistributorPoints && !normalizedSourceOrderId) {
        throw new Error('升级积分发放必须绑定真实订单ID')
      }

      // v55.1: 用事务包�?level 更新 + 积分发放 + 释放计划创建
      // 任何一步失败整体回滚，避免积分凭空多出（v54 D 遗留 bug�?
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: { level: newLevel },
        })

        if (willCreateDistributorPoints) {
            await PointsService.createPointsRecord({
              userId,
              type: 'reward',
              amount: pointsAmount,
              sourceId: normalizedSourceOrderId!,
              description: `升级为经销商发放积分（${user.upgradeProductCount}件升级产�?× ${pointsPerBox}）`,
            }, tx)

            await PointsService.createPointsUnlockSchedule({
              userId,
              orderId: normalizedSourceOrderId!,
              totalPoints: pointsAmount,
              dailyUnlockRate,
              totalDays,
              nextUnlockDate: tomorrow,
            }, tx)
          }


        if (user.referrerId && newLevel === MEMBER_LEVELS.DISTRIBUTOR && user.level < MEMBER_LEVELS.DISTRIBUTOR) {
          await tx.user.update({
            where: { id: user.referrerId },
            data: {
              directDistributorCount: {
                increment: 1,
              },
            },
          })
        }
      })

      // ????????
      try {
        await LevelSnapshotService.createSnapshotForUser(userId)
      } catch (snapErr) {
        logger.warn('[UserService] level snapshot failed', { userId, error: snapErr instanceof Error ? snapErr.message : String(snapErr) })
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

  static async recomputeQualificationStatsForUsers(
    userIds: string[],
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const client = tx ?? prisma
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)))
    const validStatuses = ['paid', 'shipped', 'completed']

    for (const userId of uniqueUserIds) {
      const [ownSales, directChildren, upgradeProducts, directDistributorCount] = await Promise.all([
        client.order.aggregate({
          where: {
            userId,
            status: { in: validStatuses },
            rewardStatus: 'completed',
          },
          _sum: { payAmount: true },
        }),
        client.user.findMany({
          where: { referrerId: userId },
          select: { id: true },
        }),
        client.orderItem.aggregate({
          where: {
            order: {
              userId,
              status: { in: validStatuses },
              rewardStatus: 'completed',
            },
            product: { isUpgradeProduct: true },
          },
          _sum: { quantity: true },
        }),
        client.user.count({
          where: {
            referrerId: userId,
            level: { gte: MEMBER_LEVELS.DISTRIBUTOR },
          },
        }),
      ])

      const directChildIds = directChildren.map((child) => child.id)

      const directChildrenSales = directChildIds.length > 0
        ? await client.order.aggregate({
          where: {
            userId: { in: directChildIds },
            status: { in: validStatuses },
            rewardStatus: 'completed',
          },
          _sum: { payAmount: true },
        })
        : { _sum: { payAmount: 0 } }

      await client.user.update({
        where: { id: userId },
        data: {
          directSalesAmount: Number(ownSales._sum.payAmount ?? 0) + Number(directChildrenSales._sum.payAmount ?? 0),
          upgradeProductCount: Number(upgradeProducts._sum.quantity ?? 0),
          directDistributorCount,
        },
      })
    }
  }
  // 获取用户基本信息（管理员用，含余额字段）
  static async getUserById(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, phone: true, nickname: true, status: true, level: true, role: true,
        balance: true, frozenBalance: true, consumeBalance: true,
        earningsPending: true, earningsAvailable: true, earningsVoided: true,
      },
    })
  }

  static async getUserBalanceRecords(userId: string, page: number = 1, limit: number = 20, filters?: { type?: string; startDate?: string; endDate?: string }) {
    const skip = (page - 1) * limit
    const where: Record<string, unknown> = { userId }

    if (filters?.type) {
      const types = filters.type.split(',')
      where.type = types.length === 1 ? types[0] : { in: types }
    }

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {} as Record<string, unknown>
      if (filters.startDate) (where.createdAt as Record<string, unknown>).gte = new Date(filters.startDate)
      if (filters.endDate) (where.createdAt as Record<string, unknown>).lte = new Date(filters.endDate)
    }

    const [records, total] = await Promise.all([
      prisma.balanceRecord.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.balanceRecord.count({ where }),
    ])

    return { records, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
  }


static async getUsersList(params: UserListParams) {
    const { page, pageSize, level, search, status, startDate, endDate, sortBy, sortOrder } = params
    const skip = (page - 1) * pageSize
    const where: Record<string, unknown> = {}

    if (level) { where.level = parseInt(level) }
    if (status) { where.status = status }

    if (search) {
      where.OR = [
        { phone: { contains: search } },
        { nickname: { contains: search } },
        { email: { contains: search } },
      ]
    }

    if (startDate || endDate) {
      where.createdAt = {} as Record<string, unknown>
      if (startDate) (where.createdAt as Record<string, unknown>).gte = new Date(startDate)
      if (endDate) (where.createdAt as Record<string, unknown>).lte = new Date(endDate)
    }

    const orderBy: Record<string, string> = {}
    if (sortBy) orderBy[sortBy] = sortOrder || 'desc'

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where, orderBy, skip, take: pageSize,
        select: { id: true, phone: true, nickname: true, email: true, level: true, status: true, role: true, balance: true, createdAt: true },
      }),
      prisma.user.count({ where }),
    ])

    return { users, page, pageSize, total }
  }

  static async getUserDetail(id: string) {
    const [user, orderStats] = await Promise.all([
      prisma.user.findUnique({
        where: { id },
        include: { _count: { select: { orders: true } } },
      }),
      prisma.order.aggregate({
        where: { userId: id, status: 'paid' },
        _sum: { payAmount: true },
        _count: true,
      }),
    ])
    return { user, orderStats }
  }

  static async updateUserLevel(id: string, newLevel: number) {
    return prisma.user.update({
      where: { id },
      data: { level: newLevel },
      select: { id: true, phone: true, nickname: true, level: true, status: true, role: true },
    })
  }

  static async updatePassword(id: string, passwordHash: string) {
    await prisma.user.update({ where: { id }, data: { passwordHash } })
  }

  static async hasPaymentPassword(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { paymentPasswordHash: true } })
    return !!user?.paymentPasswordHash
  }

  static async resetPaymentPassword(userId: string) {
    const result = await prisma.user.updateMany({
      where: { id: userId, paymentPasswordHash: { not: null } },
      data: { paymentPasswordHash: null },
    })
    return { count: result.count }
  }

  static async checkPhoneUnique(phone: string, excludeId?: string) {
    const where: Record<string, unknown> = { phone }
    if (excludeId) where.id = { not: excludeId }
    const existing = await prisma.user.findFirst({ where, select: { id: true } })
    return !existing
  }

  static async checkEmailUnique(email: string, excludeId?: string) {
    const where: Record<string, unknown> = { email }
    if (excludeId) where.id = { not: excludeId }
    const existing = await prisma.user.findFirst({ where, select: { id: true } })
    return !existing
  }

  static async getUserRole(id: string) {
    const user = await prisma.user.findUnique({ where: { id }, select: { role: true } })
    return user?.role || 'user'
  }

  static async updateProfile(id: string, data: Record<string, unknown>) {
    return prisma.user.update({
      where: { id },
      data,
      select: { id: true, phone: true, nickname: true, email: true, avatarUrl: true, role: true, updatedAt: true },
    })
  }

  static async buildReferralTree(rootUserId: string, depth: number, maxDepth: number): Promise<TreeNode | null> {
    if (depth >= maxDepth) return null
    const user = await prisma.user.findUnique({
      where: { id: rootUserId },
      select: { id: true, phone: true, nickname: true, level: true },
    })
    if (!user) return null
    const children = await prisma.user.findMany({
      where: { parentId: rootUserId },
      select: { id: true },
    })
    const childNodes: TreeNode[] = []
    for (const child of children) {
      const childNode = await this.buildReferralTree(child.id, depth + 1, maxDepth)
      if (childNode) childNodes.push(childNode)
    }
    return { id: user.id, phone: user.phone, nickname: user.nickname, level: user.level, children: childNodes }
  }

  static async updateUserStatus(id: string, status: string) {
    return prisma.user.update({
      where: { id },
      data: { status },
      select: { id: true, status: true },
    })
  }

  static async validateUserIds(ids: string[]): Promise<{ validIds: Set<string>; invalidIds: string[] }> {
    if (ids.length === 0) return { validIds: new Set(), invalidIds: [] }
    const existingUsers = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    })
    const existingIds = new Set(existingUsers.map(u => u.id))
    const invalidIds = ids.filter(id => !existingIds.has(id))
    return { validIds: existingIds, invalidIds }
  }


  /**
   * D-5.9: Admin referral tree - BFS full-tree query + ancestor chain + stats
   * Migrated from src/app/api/admin/referral-tree/[userId]/route.ts
   */
  static async getAdminReferralTree(userId: string, maxLevel: number, mode: string, boundaryDownLevel: number) {
    const MAX_NODES = 1000

    const rootUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true, nickname: true, level: true, avatarUrl: true, totalPoints: true, directSalesAmount: true, parentId: true, referrerId: true, createdAt: true },
    })
    if (!rootUser) return null

    let actualRootId = userId
    const originalUserId = userId

    if (mode === 'boundary' && rootUser.parentId) {
      let ancId: string | null = rootUser.parentId
      const visitedAnc = new Set<string>()
      for (let i = 0; i < 10 && ancId; i++) {
        if (visitedAnc.has(ancId)) break
        visitedAnc.add(ancId)
        const anc: { id: string; parentId: string | null } | null = await prisma.user.findUnique({ where: { id: ancId }, select: { id: true, parentId: true } })
        if (!anc) break
        ancId = anc.parentId
        if (!ancId) actualRootId = anc.id
      }
    }

    let effectiveRootUser = rootUser
    if (actualRootId !== userId) {
      const queried = await prisma.user.findUnique({
        where: { id: actualRootId },
        select: { id: true, phone: true, nickname: true, level: true, avatarUrl: true, totalPoints: true, directSalesAmount: true, parentId: true, referrerId: true, createdAt: true },
      })
      if (!queried) return null
      effectiveRootUser = queried
    }

    const allUsers: Array<{ id: string; phone: string; nickname: string | null; level: number; avatarUrl: string | null; totalPoints: number; directSalesAmount: number; parentId: string | null; referrerId: string | null; createdAt: Date }> = [effectiveRootUser]
    const visited = new Set<string>([effectiveRootUser.id])
    let queue = [effectiveRootUser.id]
    for (let level = 1; level < maxLevel && allUsers.length < MAX_NODES; level++) {
      if (queue.length === 0) break
      const children = await prisma.user.findMany({
        where: { parentId: { in: queue } },
        select: { id: true, phone: true, nickname: true, level: true, avatarUrl: true, totalPoints: true, directSalesAmount: true, parentId: true, referrerId: true, createdAt: true },
      })
      queue = []
      for (const child of children) {
        if (!visited.has(child.id) && allUsers.length < MAX_NODES) {
          visited.add(child.id)
          allUsers.push(child)
          queue.push(child.id)
        }
      }
    }
    const truncated = allUsers.length >= MAX_NODES || visited.size >= MAX_NODES

    if (mode === 'boundary') {
      const directChildren = await prisma.user.findMany({
        where: { parentId: originalUserId },
        select: { id: true, phone: true, nickname: true, level: true, avatarUrl: true, totalPoints: true, directSalesAmount: true, parentId: true, referrerId: true, createdAt: true },
        take: MAX_NODES,
      })
      for (const child of directChildren) {
        if (!visited.has(child.id) && allUsers.length < MAX_NODES) {
          visited.add(child.id)
          allUsers.push(child)
        }
      }
    }

    const userIds = allUsers.map(u => u.id)
    const orderCounts = await prisma.order.groupBy({ by: ['userId'], where: { userId: { in: userIds }, status: { in: ['paid', 'shipped', 'completed'] } }, _count: { _all: true } })
    const orderCountMap = new Map(orderCounts.map(o => [o.userId, o._count._all]))

    const referrerIdSet = [...new Set(allUsers.map(u => u.referrerId).filter(Boolean) as string[])]
    const referrers = referrerIdSet.length > 0 ? await prisma.user.findMany({ where: { id: { in: referrerIdSet } }, select: { id: true, nickname: true, phone: true } }) : []
    const referrerInfoMap = new Map(referrers.map(r => [r.id, r]))

    const referrerCounts = await prisma.user.groupBy({ by: ['referrerId'], where: { referrerId: { in: userIds } }, _count: { id: true } })
    const referrerCountMap = new Map(referrerCounts.map(r => [r.referrerId, r._count.id]))

    const childrenMap = new Map<string, typeof allUsers>()
    for (const u of allUsers) {
      if (u.parentId) {
        const list = childrenMap.get(u.parentId) || []
        list.push(u)
        childrenMap.set(u.parentId, list)
      }
    }

    function countTeam(nodeId: string): number {
      let count = 0
      const stack = [nodeId]
      const counted = new Set<string>([nodeId])
      while (stack.length > 0) {
        const current = stack.pop()!
        const kids = childrenMap.get(current) || []
        for (const k of kids) {
          if (!counted.has(k.id)) { counted.add(k.id); count++; stack.push(k.id) }
        }
      }
      return count
    }

    function buildNode(u: typeof allUsers[number]): Record<string, unknown> {
      const kids = childrenMap.get(u.id) || []
      const ref = referrerInfoMap.get(u.referrerId || '')
      return {
        id: u.id, phone: u.phone, nickname: u.nickname, level: u.level,
        avatarUrl: u.avatarUrl, totalPoints: u.totalPoints, directSalesAmount: u.directSalesAmount,
        orderCount: orderCountMap.get(u.id) ?? 0,
        teamCount: countTeam(u.id),
        createdAt: u.createdAt.toISOString(),
        children: kids.map(c => buildNode(c)),
        referrerId: u.referrerId,
        referrerInfo: ref ? { id: ref.id, nickname: ref.nickname, phoneTail: ref.phone.slice(-4) } : null,
        referralCount: referrerCountMap.get(u.id) ?? 0,
      }
    }

    const root = buildNode(effectiveRootUser)

    const ancestors: Array<{ id: string; nickname: string | null; phone: string }> = []
    let ancId: string | null = rootUser.parentId
    const visitedAnc2 = new Set<string>()
    for (let i = 0; i < 10 && ancId; i++) {
      if (visitedAnc2.has(ancId)) break
      visitedAnc2.add(ancId)
      const parent = await prisma.user.findUnique({ where: { id: ancId }, select: { id: true, phone: true, nickname: true, parentId: true } })
      if (!parent) break
      ancestors.unshift({ id: parent.id, nickname: parent.nickname, phone: parent.phone })
      ancId = parent.parentId
    }

    function countNodes(n: Record<string, unknown>): number {
      if (!n) return 0
      return 1 + ((n.children as Record<string, unknown>[]) || []).reduce((s: number, c) => s + countNodes(c), 0)
    }
    function sumDirectSales(n: Record<string, unknown>): number {
      if (!n) return 0
      return (n.directSalesAmount as number) + ((n.children as Record<string, unknown>[]) || []).reduce((s: number, c) => s + sumDirectSales(c), 0)
    }
    function sumOrderCounts(n: Record<string, unknown>): number {
      if (!n) return 0
      return (n.orderCount as number) + ((n.children as Record<string, unknown>[]) || []).reduce((s: number, c) => s + sumOrderCounts(c), 0)
    }
    function getMaxDepth(n: Record<string, unknown>, depth = 1): number {
      if (!n || !(n.children as Record<string, unknown>[]).length) return depth
      return Math.max(...((n.children as Record<string, unknown>[]) || []).map(c => getMaxDepth(c, depth + 1)))
    }

    return {
      success: true,
      data: root,
      truncated: truncated || undefined,
      nodeCount: truncated ? allUsers.length : undefined,
      summary: {
        totalTeam: countNodes(root) - 1,
        totalSales: sumDirectSales(root),
        totalOrders: sumOrderCounts(root),
        maxLevelReached: getMaxDepth(root),
      },
      ancestors: ancestors.length > 0 ? ancestors : undefined,
      rootParentId: ancestors.length > 0 ? rootUser.parentId : undefined,
      focusUserId: originalUserId,
      boundaryParentId: rootUser.parentId,
      boundaryDownLevel,
    }
  }


}