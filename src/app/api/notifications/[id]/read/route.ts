import { NextRequest } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { NotificationService } from '@/lib/services/notification.service'
import { errorResponse, successResponse } from '@/lib/api-response'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // v46.10.2: 改用 verifyToken 从 JWT 拿 userId
    const authUser = await verifyToken(request)
    if (!authUser) {
      return errorResponse('未登录', 401)
    }

    const { id } = await params
    const notification = await NotificationService.markAsRead(id, authUser.userId)

    return successResponse(notification, '已标记为已读')
  } catch (error: unknown) {
    logger.error('Mark notification read error:', error)
    const errMsg = error instanceof Error ? error.message : ''
    const status = errMsg === '通知不存在' ? 404
      : errMsg === '无权操作' ? 403
      : 500
    return errorResponse(error instanceof Error ? error.message : '标记失败', status)
  }
}
