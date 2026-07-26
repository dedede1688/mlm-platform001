import { NextRequest } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { NotificationService } from '@/lib/services/notification.service'
import { logger } from '@/lib/logger'
import { errorResponse, successResponse } from '@/lib/api-response'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin', 'support_admin'])
    if (authError || !admin) return authError!
    const { id } = await params
    const batch = await NotificationService.getBatch(id)
    if (!batch) return errorResponse('通知不存在', 404)
    const readCount = batch.notifications.filter(n => n.isRead).length
    return successResponse({ ...batch, readCount, recipientCount: batch.notifications.length })
  } catch (error) {
    logger.error('获取通知详情失败:', error)
    return errorResponse('获取通知详情失败', 500)
  }
}
