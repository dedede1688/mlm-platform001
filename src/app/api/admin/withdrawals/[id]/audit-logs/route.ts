import { NextRequest } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { WithdrawalAuditLogService } from '@/lib/services/withdrawal-audit-log.service'
import { logger } from '@/lib/logger'
import { errorResponse, successResponse } from '@/lib/api-response'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error: authError } = await verifyPermission(request, ['finance_admin', 'super_admin'])
    if (authError) return authError

    const { id } = await params
    const logs = await WithdrawalAuditLogService.getAuditLogs(id)

    return successResponse(logs)
  } catch (error) {
    logger.error('Get audit logs error:', error)
    return errorResponse('获取审核日志失败', 500)
  }
}
