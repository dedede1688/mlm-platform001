import { NextRequest } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { NotificationService } from '@/lib/services/notification.service'
import { logger } from '@/lib/logger'


import { errorResponse, successResponse } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError || !admin) return authError!
    const templates = await NotificationService.getAllTemplates()
    return successResponse(templates)
  } catch (error) {
    logger.error('获取通知模板列表失败:', error)
    return errorResponse('获取通知模板列表失败', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError || !admin) return authError!
    const body = await request.json()
    const { type, channel, subject, content, enabled } = body
    if (!type || !channel || !content) {
      return errorResponse('类型、渠道和内容不能为空', 400)
    }
    if (!['email', 'sms', 'in_app'].includes(channel)) {
      return errorResponse('渠道必须是 email、sms 或 in_app', 400)
    }
    if (channel === 'email' && !subject) {
      return errorResponse('邮件渠道必须提供主题', 400)
    }
    const existing = await NotificationService.findTemplateByTypeChannel(type, channel)
    if (existing) {
      const chLabel = channel === 'email' ? '邮件' : channel === 'sms' ? '短信' : '站内信'
      return errorResponse(`类型"${type}"在${chLabel}渠道已存在`, 400)
    }
    const template = await NotificationService.createTemplate({ type, channel, subject: subject ?? null, content, enabled: enabled ?? true })
    return successResponse(template)
  } catch (error) {
    logger.error('创建通知模板失败:', error)
    return errorResponse('创建通知模板失败', 500)
  }
}
