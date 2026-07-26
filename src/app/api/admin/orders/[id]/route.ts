import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { logOperation } from '@/lib/utils/operation-log'
import { OrderService } from '@/lib/services/order.service'
import { OrderLifecycleService } from '@/lib/services/order-lifecycle.service'
import { OrderNotificationService } from '@/lib/services/order-notification.service'
import { logger } from '@/lib/logger'

// GET /api/admin/orders/[id] ?? ?????????????
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['goods_admin', 'super_admin'])
    if (authError || !admin) return authError!
    const { id } = await params
    const order = await OrderService.getAdminOrderDetail(id)
    if (!order) return NextResponse.json({ success: false, message: '?????' }, { status: 404 })
    return NextResponse.json({ success: true, data: order, message: '????????' })
  } catch (error) {
    logger.error('Admin get order error:', error)
    return NextResponse.json({ success: false, message: '????????' }, { status: 500 })
  }
}

// PUT /api/admin/orders/[id] ?? ???????????
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['goods_admin', 'super_admin'])
    if (authError || !admin) return authError!
    const { id } = await params
    const body = await request.json()
    const { action, trackingNumber } = body
    if (!action || !['ship', 'cancel'].includes(action)) {
      return NextResponse.json({ success: false, message: 'action ??? ship ? cancel' }, { status: 400 })
    }
    if (action === 'ship') {
      if (!trackingNumber || typeof trackingNumber !== 'string' || trackingNumber.trim().length < 3) {
        return NextResponse.json({ success: false, message: '?????? 3 ???' }, { status: 400 })
      }
      const updated = await OrderLifecycleService.shipOrder(id, trackingNumber.trim())
      await logOperation({
        userId: admin.id, action: 'UPDATE', module: 'order', targetId: id,
        newValue: { trackingNumber: trackingNumber.trim() },
        ip: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      }).catch(() => {})
      await OrderNotificationService.notifyOrderShipped(id).catch(() => {})
      return NextResponse.json({ success: true, data: updated, message: '?????' })
    } else {
      const updated = await OrderLifecycleService.cancelOrder(id)
      await logOperation({
        userId: admin.id, action: 'UPDATE', module: 'order', targetId: id,
        ip: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      }).catch(() => {})
      await OrderNotificationService.notifyOrderCancelled({ orderId: id }).catch(() => {})
      return NextResponse.json({ success: true, data: updated, message: '?????' })
    }
  } catch (error) {
    logger.error('Admin update order error:', error)
    const message = error instanceof Error ? error.message : '??????'
    return NextResponse.json({ success: false, message }, { status: 500 })
  }
}
