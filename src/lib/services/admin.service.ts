import { prisma } from '@/lib/prisma'
import { logOperation } from '@/lib/utils/operation-log'


export class AdminService {
  // 获取系统统计信息
  static async getSystemStats() {
    const [
      totalUsers,
      totalOrders,
      totalSales,
      totalRewards,
      usersByLevel,
      todayOrders,
      todaySales,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.order.count(),
      prisma.order.aggregate({
        where: { status: 'completed' },
        _sum: { payAmount: true },
      }),
      prisma.reward.aggregate({
        where: { status: 'paid' },
        _sum: { amount: true },
      }),
      prisma.user.groupBy({
        by: ['level'],
        _count: { _all: true },
      }),
      prisma.order.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
      prisma.order.aggregate({
        where: {
          status: 'completed',
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
        _sum: { payAmount: true },
      }),
    ])

    return {
      totalUsers,
      totalOrders,
      totalSales: totalSales._sum.payAmount || 0,
      totalRewards: totalRewards._sum.amount || 0,
      usersByLevel: usersByLevel.reduce((acc: Record<string, number>, item: { level: number; _count: { _all: number } }) => {
        acc[item.level] = item._count._all
        return acc
      }, {}),
      todayOrders,
      todaySales: todaySales._sum.payAmount || 0,
    }
  }

  // 获取用户列表
  static async getUsers(page: number = 1, limit: number = 20, filters?: {
    level?: number
    status?: string
    search?: string
  }) {
    const skip = (page - 1) * limit
    
    const where: Record<string, unknown> = {}
    
    if (filters?.level !== undefined) {
      where.level = filters.level
    }
    
    if (filters?.status) {
      where.status = filters.status
    }
    
    if (filters?.search) {
      where.OR = [
        { phone: { contains: filters.search } },
        { nickname: { contains: filters.search } },
      ]
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ])

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  // 获取用户详情
  static async getUserDetail(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      include: {
        referrals: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        rewards: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    })
  }

  // 更新用户等级
  static async updateUserLevel(userId: string, newLevel: number, operatorId?: string) {
    const oldUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { level: true },
    })

    const result = await prisma.user.update({
      where: { id: userId },
      data: { level: newLevel },
    })

    if (operatorId && oldUser) {
      await logOperation({
        userId: operatorId,
        action: 'UPDATE',
        module: 'user',
        targetId: userId,
        oldValue: { level: oldUser.level },
        newValue: { level: newLevel },
      })
    }

    return result
  }

  // 更新用户状态
  static async updateUserStatus(userId: string, status: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { status },
    })
  }

  // 获取订单列表
  static async getOrders(page: number = 1, limit: number = 20, filters?: {
    status?: string
    search?: string
  }) {
    const skip = (page - 1) * limit
    
    const where: Record<string, unknown> = {}
    
    if (filters?.status) {
      where.status = filters.status
    }
    
    if (filters?.search) {
      where.orderNo = { contains: filters.search }
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: true,
          items: {
            include: { product: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.count({ where }),
    ])

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  // 获取奖励列表
  static async getRewards(page: number = 1, limit: number = 20, filters?: {
    type?: string
    status?: string
    userId?: string
  }) {
    const skip = (page - 1) * limit
    
    const where: Record<string, unknown> = {}
    
    if (filters?.type) {
      where.type = filters.type
    }
    
    if (filters?.status) {
      where.status = filters.status
    }
    
    if (filters?.userId) {
      where.userId = filters.userId
    }

    const [rewards, total] = await Promise.all([
      prisma.reward.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: true,
          order: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.reward.count({ where }),
    ])

    return {
      rewards,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

}