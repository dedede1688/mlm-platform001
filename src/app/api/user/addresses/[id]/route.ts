import { NextRequest } from 'next/server'
import { AddressService } from '@/lib/services/address.service'
import { verifyToken } from '@/lib/utils/auth'

import { errorResponse, successResponse } from '@/lib/api-response'
import { logOperation } from '@/lib/utils/operation-log'
import { logger } from '@/lib/logger'



// DELETE /api/user/addresses/[id] — 删除地址
// 如果删除的是默认地址，自动把最早创建的非默认地址提升为默认
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return errorResponse('未登录', 401)
    }

    const { id } = await params

    await AddressService.deleteAddress(user.userId, id)

    await logOperation({
      userId: user.userId,
      action: 'DELETE',
      module: 'user',
      targetId: id,
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    return successResponse(null, '地址删除成功')
  } catch (error) {
    logger.error('删除地址失败:', error)
    const message = error instanceof Error ? error.message : '删除地址失败'
    const statusCode = (error as Record<string, unknown>)?.statusCode as number || 500
    return errorResponse(message, statusCode)
  }
}
