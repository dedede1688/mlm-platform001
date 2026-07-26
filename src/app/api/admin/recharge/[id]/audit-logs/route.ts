import { NextRequest } from 'next/server'
import { errorResponse, successResponse } from '@/lib/api-response'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { RechargeService } from '@/lib/services/recharge.service'
import { logger } from '@/lib/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error: authError } = await verifyPermission(request, ['finance_admin', 'super_admin'])
    if (authError) return authError

    const { id } = await params
    const data = await RechargeService.getAuditLogs(id)

    return successResponse(data)
  } catch (error) {
    logger.error('Admin get recharge audit logs error:', error)
    return errorResponse('获取审核日志失败', 500)
  }
}
