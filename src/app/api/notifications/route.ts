import { NextRequest } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { NotificationService } from '@/lib/services/notification.service'
import { errorResponse, successResponse } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { z } from 'zod'
import { parseQuery } from '@/lib/validations/helper'

const notificationsQuerySchema = z.object({
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('20'),
})

export async function GET(request: NextRequest) {
  try {
    // v46.10.2: 改用 verifyToken 从 JWT 拿 userId
    const authUser = await verifyToken(request)
    if (!authUser) {
      return errorResponse('未登录', 401)
    }

    const { searchParams } = new URL(request.url)
    const qresult = parseQuery(notificationsQuerySchema, searchParams)
    const params = ('error' in qresult ? { page: '1', limit: '20' } : qresult.data) as Record<string, string | undefined>
    const page = Math.max(1, parseInt(params.page || '1'))
    const limit = Math.min(50, Math.max(1, parseInt(params.limit || '20')))

    const result = await NotificationService.listMyNotifications(authUser.userId, page, limit)

    return successResponse(result)
  } catch (error) {
    logger.error('Get notifications error:', error)
    return errorResponse('获取通知失败', 500)
  }
}
