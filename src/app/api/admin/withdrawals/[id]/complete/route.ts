import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { logOperation } from '@/lib/utils/operation-log'
import { WITHDRAWAL_STATUS } from '@/lib/constants'
import { validatePaymentProofUrl } from '@/lib/utils/validate-payment-proof'
import { WithdrawalService } from '@/lib/services/withdrawal.service'
import { logger } from '@/lib/logger'

// PATCH /api/admin/withdrawals/[id]/complete — 完成提现打款
// 只允许 super_admin / finance_admin
// body: { paymentProofUrl: string, remark?: string }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['finance_admin', 'super_admin'])
    if (authError || !admin) return authError!

    const { id } = await params
    const { paymentProofUrl, remark } = await request.json()

    // HV-5：校验打款凭证（域名 + 格式安全校验）
    let safePaymentProofUrl: string
    try {
      safePaymentProofUrl = validatePaymentProofUrl(paymentProofUrl)
    } catch (e: unknown) {
      return NextResponse.json(
        { success: false, message: e instanceof Error ? e.message : '打款凭证无效' },
        { status: 400 }
      )
    }

    const updated = await WithdrawalService.completeWithdrawal(id, {
      completedBy: admin.id,
      paymentProofUrl: safePaymentProofUrl,
      remark: remark?.trim() || undefined,
    })

    await logOperation({
      userId: admin.id,
      action: 'COMPLETE_WITHDRAWAL',
      module: 'finance',
      targetId: id,
      oldValue: { status: WITHDRAWAL_STATUS.APPROVED },
      newValue: {
        status: WITHDRAWAL_STATUS.COMPLETED,
        paymentProofUrl: safePaymentProofUrl,
      },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    return NextResponse.json({
      success: true,
      data: updated,
      message: '提现打款已完成，冻结收益已扣除',
    })
  } catch (error: unknown) {
    logger.error('Admin complete withdrawal error:', error)
    const errMsg = error instanceof Error ? error.message : ''
    const status = errMsg === '提现记录不存在' ? 404
      : errMsg === '只有已审核通过的提现才能完成打款' ? 400
      : errMsg === '打款凭证不能为空' ? 400
      : 500
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : '完成提现打款失败' },
      { status }
    )
  }
}
