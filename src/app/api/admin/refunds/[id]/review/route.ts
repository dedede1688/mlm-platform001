import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { logOperation } from '@/lib/utils/operation-log'
import { OrderLifecycleService } from '@/lib/services/order-lifecycle.service'
import { OrderNotificationService } from '@/lib/services/order-notification.service'
import { logger } from '@/lib/logger'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin', 'finance_admin'])
    if (authError || !admin) return authError!

    const body = await request.json()
    const { action, adminComment } = body as { action: 'approve' | 'reject'; adminComment?: string }

    if (!action || (action !== 'approve' && action !== 'reject')) {
      return NextResponse.json({ success: false, message: 'action ??? approve ? reject' }, { status: 400 })
    }

    const normalizedAdminComment = typeof adminComment === 'string' ? adminComment.trim() : ''
    if (action === 'reject' && normalizedAdminComment.length < 5) {
      return NextResponse.json({ success: false, message: '????????5???' }, { status: 400 })
    }

    const refundRequest = await OrderLifecycleService.getRefundRequestById(id)
    if (!refundRequest) return NextResponse.json({ success: false, message: '???????' }, { status: 404 })
    if (refundRequest.status !== 'pending') return NextResponse.json({ success: false, message: '??????????' }, { status: 400 })

    const updated = await OrderLifecycleService.reviewRefund(id, {
      action, reviewedBy: admin.id,
      adminComment: normalizedAdminComment || undefined,
    })

    await logOperation({
      userId: admin.id, action: action === 'approve' ? 'APPROVE' : 'REJECT', module: 'refund', targetId: id,
      newValue: { status: updated.status, adminComment: normalizedAdminComment || null },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    await OrderNotificationService.notifyRefundReview({
      userId: refundRequest.userId, refundId: id,
      orderId: refundRequest.order.id, orderNo: refundRequest.order.orderNo,
      action, adminComment: normalizedAdminComment || undefined, operatorId: admin.id,
    })

    return NextResponse.json({
      success: true, data: updated,
      message: action === 'approve' ? '???????' : '???????',
    })
  } catch (error) {
    logger.error('Admin review refund error:', error)
    return NextResponse.json({ success: false, message: '??????' }, { status: 500 })
  }
}
