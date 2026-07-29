import { NextRequest } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { WithdrawalRejectTemplateService } from '@/lib/services/withdrawal-reject-template.service'
import { logger } from '@/lib/logger'


import { errorResponse, successResponse } from '@/lib/api-response'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error: authError } = await verifyPermission(request, ['finance_admin', 'super_admin'])
    if (authError) return authError

    const { id } = await params
    const body = await request.json()
    const { title, content, sortOrder, isEnabled } = body

    const template = await WithdrawalRejectTemplateService.update(id, {
      title,
      content,
      sortOrder,
      isEnabled,
    })

    return successResponse(template, '模板更新成功')
  } catch (error: unknown) {
    logger.error('Update reject template error:', error)
    return errorResponse(error instanceof Error ? error.message : '更新模板失败', 500)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error: authError } = await verifyPermission(request, ['finance_admin', 'super_admin'])
    if (authError) return authError

    const { id } = await params
    await WithdrawalRejectTemplateService.delete(id)

    return successResponse(null, '模板删除成功')
  } catch (error: unknown) {
    logger.error('Delete reject template error:', error)
    return errorResponse(error instanceof Error ? error.message : '删除模板失败', 500)
  }
}
