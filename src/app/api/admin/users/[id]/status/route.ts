import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { logOperation } from '@/lib/utils/operation-log'
import { OrderNotificationService } from '@/lib/services/order-notification.service'
import { logger } from '@/lib/logger'
import { UserService } from '@/lib/services/user.service'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError || !admin) return authError!
    const { id } = await params
    const body = await request.json()
    const { status, reason } = body
    if (!status || !['active', 'frozen'].includes(status)) { return NextResponse.json({ success: false, message: 'status 必须为 active 或 frozen' }, { status: 400 }) }
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) { return NextResponse.json({ success: false, message: '原因至少 5 个字' }, { status: 400 }) }
    const existing = await UserService.getUserById(id)
    if (!existing || existing.status === 'deleted') { return NextResponse.json({ success: false, message: '用户不存在' }, { status: 404 }) }
    if (existing.status === status) { return NextResponse.json({ success: false, message: '状态未变化' }, { status: 400 }) }
    const updated = await UserService.updateUserStatus(id, status)
    await logOperation({
      userId: admin.id, action: 'UPDATE', module: 'user', targetId: id,
      oldValue: { status: existing.status }, newValue: { status: updated.status },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })
    await OrderNotificationService.notifyUserStatusChange({ userId: id, status, reason, operatorId: admin.id })
    const actionLabel = status === 'active' ? '解封' : '冻结'
    return NextResponse.json({ success: true, data: { status: updated.status }, message: `状态已${actionLabel}` })
  } catch (error) {
    logger.error('Change status error:', error)
    return NextResponse.json({ success: false, message: '状态变更失败' }, { status: 500 })
  }
}
