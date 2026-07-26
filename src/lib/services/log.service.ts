import { prisma } from "@/lib/prisma"

export interface OperationLogFilters {
  module?: string
  action?: string
  userId?: string
  startDate?: string
  endDate?: string
}

export class LogService {
  /** 管理员获取操作日志列表（分页 + 多条件过滤） */
  static async getOperationLogs(page: number = 1, limit: number = 20, filters?: OperationLogFilters) {
    const skip = (page - 1) * limit
    const where: Record<string, unknown> = {}

    if (filters?.module) where.module = filters.module
    if (filters?.action) where.action = filters.action
    if (filters?.userId) where.userId = filters.userId

    if (filters?.startDate || filters?.endDate) {
      const createdAt: Record<string, Date> = {}
      if (filters.startDate) createdAt.gte = new Date(filters.startDate)
      if (filters.endDate) createdAt.lte = new Date(new Date(filters.endDate).setHours(23, 59, 59, 999))
      where.createdAt = createdAt
    }

    const [logs, total] = await Promise.all([
      prisma.operationLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, phone: true, nickname: true, role: true },
          },
        },
      }),
      prisma.operationLog.count({ where }),
    ])

    return { data: logs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
  }
}
