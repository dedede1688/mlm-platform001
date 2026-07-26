import { NextRequest } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { logOperation } from '@/lib/utils/operation-log'
import { OrderNotificationService } from '@/lib/services/order-notification.service'
import { logger } from '@/lib/logger'
import { UserService } from '@/lib/services/user.service'
import { errorResponse, successResponse } from '@/lib/api-response'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError || !admin) return authError!
    const { id } = await params
    const body = await request.json()
    const { status, reason } = body
    if (!status || !['active', 'frozen'].includes(status)) { return errorResponse('status 必须为 active 或 frozen', 400) }
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) { return errorResponse('原因至少 5 个字', 400) }
    const existing = await UserService.getUserById(id)
    if (!existing || existing.status === 'deleted') { return errorResponse('用户不存在', 404) }
    if (existing.status === status) { return errorResponse('状态未变化', 400) }
    const updated = await UserService.updateUserStatus(id, status)
    await logOperation({
      userId: admin.id, action: 'UPDATE', module: 'user', targetId: id,
      oldValue: { status: existing.status }, newValue: { status: updated.status },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })
    await OrderNotificationService.notifyUserStatusChange({ userId: id, status, reason, operatorId: admin.id })
    const actionLabel = status === 'active' ? '解封' : '冻结'
    return successResponse({ status: updated.status }, `状态已${actionLabel}`)
  } catch (error) {
    logger.error('Change status error:', error)
    return errorResponse('状态变更失败', 500)
  }
}
