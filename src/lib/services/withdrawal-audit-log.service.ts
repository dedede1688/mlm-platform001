import { prisma } from '@/lib/prisma'

export class WithdrawalAuditLogService {
  static async logReview(params: {
    withdrawalId: string
    action: string
    oldStatus: string
    newStatus: string
    operatorId?: string
    reason?: string
    remark?: string
  }) {
    return prisma.withdrawalAuditLog.create({
      data: {
        withdrawalId: params.withdrawalId,
        action: params.action,
        oldStatus: params.oldStatus,
        newStatus: params.newStatus,
        operatorId: params.operatorId,
        reason: params.reason,
        remark: params.remark,
      },
    })
  }

  static async getAuditLogs(withdrawalId: string) {
    return prisma.withdrawalAuditLog.findMany({
      where: { withdrawalId },
      orderBy: { createdAt: 'desc' },
    })
  }
}