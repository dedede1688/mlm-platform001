import { NextRequest } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { logOperation } from '@/lib/utils/operation-log'
import bcrypt from 'bcryptjs'
import { logger } from '@/lib/logger'
import { OrderNotificationService } from '@/lib/services/order-notification.service'
import { UserService } from '@/lib/services/user.service'
import { errorResponse, successResponse } from '@/lib/api-response'
import { parseBody } from '@/lib/validations/helper'
import { userPasswordSchema } from '@/lib/validations/admin/users'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError || !admin) return authError!
    const { id } = await params

    const { data: body, error: parseError } = await parseBody(userPasswordSchema, request)
    if (parseError) return parseError

    const existing = await UserService.getUserById(id)
    if (!existing || existing.status === 'deleted') { return errorResponse('用户不存在', 404) }
    const passwordHash = await bcrypt.hash(body.newPassword, 10)
    await UserService.updatePassword(id, passwordHash)
    await logOperation({
      userId: admin.id, action: 'UPDATE', module: 'user', targetId: id,
      oldValue: { action: 'password_reset' },
      newValue: { action: 'password_reset_by_admin', adminPhone: admin.phone },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })
    await OrderNotificationService.notifyPasswordResetByAdmin({
      userId: id, operatorId: admin.id, reason: body.reason.trim(),
    })
    logger.info(`[PasswordReset] 管理员 ${admin.phone} 重置了用户 ${existing.phone} 的密码，原因：${body.reason}`)
    return successResponse(null, '密码重置成功')
  } catch (error) {
    logger.error('Reset password error:', error)
    return errorResponse('密码重置失败', 500)
  }
}
