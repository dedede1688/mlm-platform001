import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'
import { logOperation } from '@/lib/utils/operation-log'
import { OrderNotificationService } from '@/lib/services/order-notification.service'

// PATCH /api/admin/refunds/[id]/review — 审核退款申请（通过/拒绝）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin', 'finance_admin'])
    if (authError || !admin) return authError!

    const body = await request.json()
    const { action, adminComment } = body as {
      action: 'approve' | 'reject'
      adminComment?: string
    }

    if (!action || (action !== 'approve' && action !== 'reject')) {
      return NextResponse.json(
        { success: false, message: 'action 必须为 approve 或 reject' },
        { status: 400 }
      )
    }

    // 查询退款申请
    const refundRequest = await prisma.refundRequest.findUnique({ where: { id } })
    if (!refundRequest) {
      return NextResponse.json(
        { success: false, message: '退款申请不存在' },
        { status: 404 }
      )
    }

    if (refundRequest.status !== 'pending') {
      return NextResponse.json(
        { success: false, message: '仅待审核的申请可操作' },
        { status: 400 }
      )
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected'

    const updated = await prisma.refundRequest.update({
      where: { id },
      data: {
        status: newStatus,
        adminComment: adminComment?.trim() || null,
      },
    })

    // 操作日志
    await logOperation({
      userId: admin.id,
      action: action === 'approve' ? 'APPROVE' : 'REJECT',
      module: 'refund',
      targetId: id,
      newValue: { status: newStatus, adminComment: adminComment?.trim() || null },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    // v46.12: 触发退款审核通知（修复 review 路由没调 sendInApp 的死代码）
    await OrderNotificationService.notifyRefundReview({
      userId: refundRequest.userId,
      refundId: id,
      action,
      adminComment: adminComment?.trim(),
      operatorId: admin.id,
    })

    return NextResponse.json({
      success: true,
      data: updated,
      message: action === 'approve' ? '退款申请已通过' : '退款申请已拒绝',
    })
  } catch (error) {
    console.error('Admin review refund error:', error)
    return NextResponse.json(
      { success: false, message: '审核操作失败' },
      { status: 500 }
    )
  }
}