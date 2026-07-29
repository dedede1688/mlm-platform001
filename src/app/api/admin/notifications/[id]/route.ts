import { NextRequest } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { NotificationService } from '@/lib/services/notification.service'
import { logger } from '@/lib/logger'


import { errorResponse, successResponse } from '@/lib/api-response'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError || !admin) return authError!
    const { id } = await params
    const template = await NotificationService.getTemplateById(id)
    if (!template) return errorResponse('模板不存在', 404)
    return successResponse(template)
  } catch (error) {
    logger.error('获取模板详情失败:', error)
    return errorResponse('获取模板详情失败', 500)
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError || !admin) return authError!
    const { id } = await params
    const body = await request.json()
    const { type, channel, subject, content, enabled } = body
    const data: Record<string, unknown> = {}
    if (type !== undefined) data.type = type
    if (channel !== undefined) data.channel = channel
    if (subject !== undefined) data.subject = subject
    if (content !== undefined) data.content = content
    if (enabled !== undefined) data.enabled = enabled
    const updated = await NotificationService.updateTemplate(id, data)
    return successResponse(updated)
  } catch (error) {
    logger.error('更新模板失败:', error)
    return errorResponse('更新模板失败', 500)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError || !admin) return authError!
    const { id } = await params
    await NotificationService.deleteTemplate(id)
    return successResponse(null, '模板删除成功')
  } catch (error) {
    logger.error('删除模板失败:', error)
    return errorResponse('删除模板失败', 500)
  }
}
