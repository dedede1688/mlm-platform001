import { NextRequest } from 'next/server'
import { AddressService } from '@/lib/services/address.service'
import { verifyToken } from '@/lib/utils/auth'
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/utils/rate-limit"
import { errorResponse, successResponse } from '@/lib/api-response'
import { logOperation } from '@/lib/utils/operation-log'
import { logger } from '@/lib/logger'
import { z } from 'zod'
import { parseBody } from '@/lib/validations/helper'

const addressPartialSchema = z.object({
  recipientName: z.string().min(2, '?????????? 2-20 ?').max(20, '?????????? 2-20 ?').optional(),
  phone: z.string().regex(/^1\d{10}$/, '???????').optional(),
  province: z.string().min(1, '?????').optional(),
  city: z.string().min(1, '?????').optional(),
  district: z.string().min(1, '?????').optional(),
  detailAddress: z.string().min(5, '????????? 5-100 ?').max(100, '????????? 5-100 ?').optional(),
  isDefault: z.boolean().optional(),
})


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
