import { NextRequest } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { NotificationService } from '@/lib/services/notification.service'
import { UserService } from '@/lib/services/user.service'
import { logger } from '@/lib/logger'
import { errorResponse, successResponse } from '@/lib/api-response'
import { parseBody } from '@/lib/validations/helper'
import { sendNotificationSchema } from '@/lib/validations/admin/notifications'

export async function POST(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError || !admin) return authError!

    const { data: body, error: parseError } = await parseBody(sendNotificationSchema, request)
    if (parseError) return parseError

    // 额外业务校验：通用通知必须有收件人
    if (body.type === 'general' && (!body.userIds || body.userIds.length === 0)) {
      return errorResponse('通用通知必须指定至少一个收件人', 400)
    }

    const validateIds = body.type === 'announcement' ? [] : (body.userIds || [])
    if (validateIds.length > 0) {
      const { invalidIds } = await UserService.validateUserIds(validateIds)
      if (invalidIds.length > 0) {
        return errorResponse(
          `收件人 userId 不存在（${invalidIds.length} 个）：${invalidIds.slice(0, 3).join(', ')}${invalidIds.length > 3 ? '...' : ''}。请到会员管理页面查看真实 UUID。`,
          400
        )
      }
    }

    const result = await NotificationService.sendNotifications({
      type: body.type,
      senderId: admin.id,
      content: body.content,
      subject: body.subject,
      userIds: body.type === 'general' ? body.userIds : undefined,
      isAnnouncement: body.type === 'announcement',
    })
    return successResponse(result)
  } catch (error) {
    logger.error('发送通知失败:', error)
    return errorResponse('发送通知失败', 500)
  }
}
