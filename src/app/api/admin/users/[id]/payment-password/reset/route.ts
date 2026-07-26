import { NextRequest } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { errorResponse, successResponse } from '@/lib/api-response'
import { logOperation } from '@/lib/utils/operation-log'
import { OrderNotificationService } from '@/lib/services/order-notification.service'
import { UserService } from '@/lib/services/user.service'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError) return authError
    if (!admin) return errorResponse('权限不足', 403)
    if (admin.role !== 'super_admin') { return errorResponse('权限不足，仅超级管理员可执行此操作', 403) }
    const body = await request.json()
    const { reason, phoneSuffix } = body as { reason: string; phoneSuffix: string }
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) { return errorResponse('原因不能为空且不少于 5 个字', 400) }
    if (!phoneSuffix || typeof phoneSuffix !== 'string' || !/^\d{4}$/.test(phoneSuffix)) { return errorResponse('手机号后 4 位必须为 4 位数字', 400) }
    const { id: userId } = await params
    const targetUser = await UserService.getUserById(userId)
    if (!targetUser || targetUser.status === 'deleted') { return errorResponse('用户不存在', 404) }
    if (targetUser.phone.slice(-4) !== phoneSuffix) { return errorResponse('手机号后 4 位不匹配', 400) }
    const hasPwd = await UserService.hasPaymentPassword(userId)
    if (!hasPwd) { return errorResponse('用户未设置支付密码，无需重置', 400) }
    const updated = await UserService.resetPaymentPassword(userId)
    if (updated.count !== 1) { return errorResponse('支付密码状态已变更，请刷新后重试', 409, { code: 'CONFLICT' }) }
    await logOperation({
      userId: admin.id, action: 'UPDATE', module: 'user', targetId: userId,
      oldValue: { paymentPasswordStatus: '已设置' },
      newValue: { paymentPasswordStatus: '已清除', reason: reason.trim(), phoneSuffix },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })
    try { await OrderNotificationService.notifyPaymentPasswordReset({ userId, operatorId: admin.id }) } catch (notifyErr) { logger.error('[payment-password/reset] 通知失败:', notifyErr) }
    return successResponse({ hasPaymentPassword: false }, '支付密码已重置，请通知用户重新设置')
  } catch (error: unknown) {
    logger.error('[payment-password/reset] 未知错误:', error)
    return errorResponse('服务器内部错误', 500)
  }
}
