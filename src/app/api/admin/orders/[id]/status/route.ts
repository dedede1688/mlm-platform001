import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { OrderService } from '@/lib/services/order.service'
import { logOperation } from '@/lib/utils/operation-log'
import { OrderNotificationService } from '@/lib/services/order-notification.service'
import { logger } from '@/lib/logger'

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['paid', 'cancelled'],
  paid: ['shipped', 'cancelled'],
  shipped: ['completed'],
}

const ALLOWED_STATUSES = ['paid', 'shipped', 'completed', 'cancelled']

// PATCH /api/admin/orders/[id]/status ?? ?????????
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin', 'goods_admin'])
    if (authError || !admin) return authError!

    const { id } = await params
    const order = await OrderService.getOrderById(id)
    if (!order) return NextResponse.json({ success: false, error: '?????' }, { status: 404 })

    const body = await request.json()
    const { status, trackingNumber, reason } = body as { status?: string; trackingNumber?: string; reason?: string }

    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json({ success: false, error: `status ??? ${ALLOWED_STATUSES.join('/')}` }, { status: 400 })
    }

    const allowedNext = VALID_TRANSITIONS[order.status]
    if (!allowedNext || !allowedNext.includes(status)) {
      return NextResponse.json({ success: false, error: `???? ${order.status} ????? ${status}` }, { status: 400 })
    }

    const data: Record<string, unknown> = { status }

    if (status === 'paid' && !order.paidAt) data.paidAt = new Date()
    if (status === 'shipped') {
      if (!order.shippedAt) data.shippedAt = new Date()
      if (trackingNumber && typeof trackingNumber === 'string') data.trackingNumber = trackingNumber.trim()
    }
    if (status === 'completed') data.completedAt = new Date()
    if (status === 'cancelled') data.cancelledAt = new Date()

    const updated = await OrderService.updateOrder(id, data)

    await logOperation({
      userId: admin.id, action: 'UPDATE', module: 'order', targetId: id,
      oldValue: { status: order.status }, newValue: data,
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    if (status === 'shipped') await OrderNotificationService.notifyOrderShipped(id)
    else if (status === 'completed') await OrderNotificationService.notifyOrderCompleted(id)
    else if (status === 'cancelled') await OrderNotificationService.notifyOrderCancelled({
      orderId: id, reason: typeof reason === 'string' && reason.trim() ? reason.trim() : '?????',
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    logger.error('Admin update order status error:', error)
    return NextResponse.json({ success: false, error: '????????' }, { status: 500 })
  }
}
