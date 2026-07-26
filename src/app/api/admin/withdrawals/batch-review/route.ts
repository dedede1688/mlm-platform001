import { NextRequest } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { WithdrawalService } from '@/lib/services/withdrawal.service'
import { logOperation } from '@/lib/utils/operation-log'
import { logger } from '@/lib/logger'
import { errorResponse, successResponse } from '@/lib/api-response'

export async function POST(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['finance_admin', 'super_admin'])
    if (authError || !admin) return authError

    const { ids, action, rejectReason, rejectTemplateId, remark } = await request.json()

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse('缺少提现记录 ID 列表', 400)
    }

    if (!action || !['approve', 'reject'].includes(action)) {
      return errorResponse('action 必须为 approve 或 reject', 400)
    }

    const approved = action === 'approve'
    const results = await WithdrawalService.batchReview(ids, {
      approved,
      reviewedBy: admin.id,
      rejectReason,
      rejectTemplateId,
      remark,
    })

    await logOperation({
      userId: admin.id,
      action: approved ? 'BATCH_APPROVE' : 'BATCH_REJECT',
      module: 'finance',
      targetId: ids.join(','),
      oldValue: { count: ids.length },
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
