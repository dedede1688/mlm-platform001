import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { WithdrawalService } from '@/lib/services/withdrawal.service'
import { logOperation } from '@/lib/utils/operation-log'
import { WITHDRAWAL_STATUS } from '@/lib/constants'

export async function POST(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['finance_admin', 'super_admin'])
    if (authError || !admin) return authError

    const { ids, action, rejectReason, rejectTemplateId, remark } = await request.json()

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: false, message: '请选择至少一条提现记录' }, { status: 400 })
    }

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ success: false, message: 'action 必须为 approve 或 reject' }, { status: 400 })
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

    return NextResponse.json({
      success: true,
      data: results,
      message: `批量审核完成：成功 ${results.success} 条，失败 ${results.failed} 条`,
    })
  } catch (error) {
    console.error('Batch review error:', error)
    return NextResponse.json({ success: false, message: '批量审核失败' }, { status: 500 })
  }
}