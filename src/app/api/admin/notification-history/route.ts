import { NextRequest } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { NotificationService } from '@/lib/services/notification.service'
import { logger } from '@/lib/logger'
import { errorResponse, successResponse } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin', 'support_admin'])
    if (authError || !admin) return authError!
    const { searchParams } = new URL(request.url)
    const result = await NotificationService.getBatches({
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '20'),
      type: searchParams.get('type') || undefined,
      status: searchParams.get('status') || undefined,
    })
    return successResponse(result)
  } catch (error) {
    logger.error('获取通知历史列表失败:', error)
    return errorResponse('获取通知历史列表失败', 500)
  }
}
