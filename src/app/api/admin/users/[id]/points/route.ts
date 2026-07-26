import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { logOperation } from '@/lib/utils/operation-log'
import { PointsService } from '@/lib/services/points.service'
import { OrderNotificationService } from '@/lib/services/order-notification.service'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError || !admin) return authError!
    const { id } = await params
    const body = await request.json()
    const { type, amount, reason } = body
    if (!type || !['totalPoints', 'unlockedPoints', 'lockedPoints'].includes(type)) {
      return NextResponse.json({ success: false, message: 'type ??? totalPoints?unlockedPoints ? lockedPoints' }, { status: 400 })
    }
    if (typeof amount !== 'number' || amount === 0 || isNaN(amount)) {
      return NextResponse.json({ success: false, message: 'amount ???????' }, { status: 400 })
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      return NextResponse.json({ success: false, message: '???? 5 ??' }, { status: 400 })
    }
    const result = await PointsService.adminAdjustPoints({ userId: id, type, amount, reason: reason.trim(), adminId: admin.id })
    await logOperation({
      userId: admin.id, action: 'UPDATE', module: 'user', targetId: id,
      oldValue: result.oldValue,
      newValue: {
        totalPoints: result.updated.totalPoints,
        unlockedPoints: result.updated.unlockedPoints,
        lockedPoints: result.updated.lockedPoints,
      },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })
    const actionLabel = amount > 0 ? '??' : '??'
    logger.info(`[PointsAdjust] ?? ${id} ?${result.fieldLabel}?${actionLabel} ${Math.abs(amount)}????${reason}`)
    await OrderNotificationService.notifyPointsAdjust({
      userId: id, fieldLabel: result.fieldLabel, amount,
      newTotalPoints: result.updated.totalPoints,
      newUnlockedPoints: result.updated.unlockedPoints,
      newLockedPoints: result.updated.lockedPoints,
      reason: reason.trim(), operatorId: admin.id,
    })
    return NextResponse.json({
      success: true,
      data: { totalPoints: result.updated.totalPoints, unlockedPoints: result.updated.unlockedPoints, lockedPoints: result.updated.lockedPoints },
      message: `???????${result.fieldLabel}${actionLabel} ${Math.abs(amount)}`,
    })
  } catch (error) {
    logger.error('Adjust points error:', error)
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : '??????' }, { status: 500 })
  }
}
