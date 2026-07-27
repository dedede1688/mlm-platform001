import { NextRequest } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { WithdrawalService } from '@/lib/services/withdrawal.service'
import { logOperation } from '@/lib/utils/operation-log'
import { logger } from '@/lib/logger'
import { errorResponse, successResponse } from '@/lib/api-response'
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/utils/rate-limit"
import { parseBody } from '@/lib/validations/helper'
import { withdrawalsBatchReviewSchema } from '@/lib/validations/admin/withdrawals'

export async function POST(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['finance_admin', 'super_admin'])
    if (authError || !admin) return authError

    const { data: body, error: parseError } = await parseBody(withdrawalsBatchReviewSchema, request)
    if (parseError) return parseError

    const approved = body.action === 'approve'
    const results = await WithdrawalService.batchReview(body.ids, {
      approved,
      reviewedBy: admin.id,
      rejectReason: body.rejectReason,
      rejectTemplateId: body.rejectTemplateId,
      remark: body.remark,
    })

    await logOperation({
      userId: admin.id,
      action: approved ? 'BATCH_APPROVE' : 'BATCH_REJECT',
      module: 'finance',
      targetId: body.ids.join(','),
      oldValue: { count: body.ids.length },
      newValue: { success: results.success, failed: results.failed },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    return successResponse(results, `批量审核完成：成功 ${results.success} 条，失败 ${results.failed} 条`)
  } catch (error) {
    logger.error('Batch review error:', error)
    return errorResponse('批量审核失败', 500)
  }
}
