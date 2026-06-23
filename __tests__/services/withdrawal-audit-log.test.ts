import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const createMockChain = () => ({
    create: vi.fn(),
    findMany: vi.fn(),
  })
  return { prisma: { withdrawalAuditLog: createMockChain() } }
})

import { prisma } from '@/lib/prisma'
import { WithdrawalAuditLogService } from '@/lib/services/withdrawal-audit-log.service'

describe('WithdrawalAuditLogService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('should log a review action', async () => {
    const log = { id: 'log1', withdrawalId: 'w1', action: 'approve' }
    prisma.withdrawalAuditLog.create.mockResolvedValueOnce(log)
    const result = await WithdrawalAuditLogService.logReview({
      withdrawalId: 'w1',
      action: 'approve',
      oldStatus: 'pending',
      newStatus: 'approved',
      operatorId: 'admin1',
    })
    expect(result).toEqual(log)
    expect(prisma.withdrawalAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ withdrawalId: 'w1', action: 'approve', oldStatus: 'pending', newStatus: 'approved', operatorId: 'admin1' }),
    })
  })

  it('should get audit logs for a withdrawal', async () => {
    const logs = [{ id: 'log1', action: 'approve' }]
    prisma.withdrawalAuditLog.findMany.mockResolvedValueOnce(logs)
    const result = await WithdrawalAuditLogService.getAuditLogs('w1')
    expect(result).toEqual(logs)
    expect(prisma.withdrawalAuditLog.findMany).toHaveBeenCalledWith({ where: { withdrawalId: 'w1' }, orderBy: { createdAt: 'desc' } })
  })
})