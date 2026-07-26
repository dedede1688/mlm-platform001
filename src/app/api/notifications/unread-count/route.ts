import { NextRequest } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { NotificationService } from '@/lib/services/notification.service'
import { errorResponse, successResponse } from '@/lib/api-response'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const authUser = await verifyToken(request)
    if (!authUser) {
      return errorResponse('未登录', 401)
    }
    const count = await NotificationService.getUnreadCount(authUser.userId)
    return successResponse({ count })
  } catch (error) {
    logger.error('[v46.8 unread-count] error:', error)
    return errorResponse('获取未读数失败', 500)
  }
}
