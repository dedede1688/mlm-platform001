import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { logOperation } from '@/lib/utils/operation-log'
import { WITHDRAWAL_STATUS } from '@/lib/constants'
import { WithdrawalService } from '@/lib/services/withdrawal.service'

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

    if (!paymentProofUrl || !paymentProofUrl.trim()) {
      return NextResponse.json(
        { success: false, message: '打款凭证不能为空，请上传打款凭证' },
        { status: 400 }
      )
    }

    const updated = await WithdrawalService.completeWithdrawal(id, {
      completedBy: admin.id,
      paymentProofUrl: paymentProofUrl.trim(),
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
        paymentProofUrl: paymentProofUrl.trim(),
      },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    return NextResponse.json({
      success: true,
      data: updated,
      message: '提现打款已完成，冻结收益已扣除',
    })
  } catch (error: any) {
    console.error('Admin complete withdrawal error:', error)
    const status = error.message === '提现记录不存在' ? 404
      : error.message === '只有已审核通过的提现才能完成打款' ? 400
      : error.message === '打款凭证不能为空' ? 400
      : 500
    return NextResponse.json(
      { success: false, message: error.message || '完成提现打款失败' },
      { status }
    )
  }
}
