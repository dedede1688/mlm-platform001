import { NextRequest } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { WithdrawalRejectTemplateService } from '@/lib/services/withdrawal-reject-template.service'
import { logger } from '@/lib/logger'
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/utils/rate-limit"
import { parseBody } from "@/lib/validations/helper"
import { withdrawalTemplateCreateSchema } from "@/lib/validations/admin/withdrawal-templates"
import { errorResponse, successResponse } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await verifyPermission(request, ['finance_admin', 'super_admin'])
    if (authError) return authError

    const templates = await WithdrawalRejectTemplateService.list()
    return successResponse(templates)
  } catch (error) {
    logger.error('Get reject templates error:', error)
    return errorResponse('获取模板列表失败', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['finance_admin', 'super_admin'])
    if (authError || !admin) return authError

    const body = await request.json()
    const { title, content, sortOrder, isEnabled } = body

    if (!title || !content) {
      return errorResponse('标题和内容不能为空', 400)
    }

    const template = await WithdrawalRejectTemplateService.create({
      title,
      content,
      sortOrder,
      isEnabled,
    })

    return successResponse(template, '模板创建成功')
  } catch (error) {
    logger.error('Create reject template error:', error)
    return errorResponse('创建模板失败', 500)
  }
}
