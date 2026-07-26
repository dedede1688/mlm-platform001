import { NextRequest } from 'next/server'
import { errorResponse, successResponse } from '@/lib/api-response'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { PointsService } from '@/lib/services/points.service'

// POST /api/admin/points/void — 管理员作废用户积分
export async function POST(request: NextRequest) {
  try {
    // 鉴权：仅 super_admin 和 finance_admin
    const { user: admin, error: authError } = await verifyPermission(
      request, ['super_admin', 'finance_admin']
    )
    if (authError || !admin) return authError!

    const body = await request.json()
    const { userId, amount, reason } = body

    // 参数校验
    if (!userId || typeof userId !== 'string') {
      return errorResponse('userId 必填', 400)
    }

    if (typeof amount !== 'number' || amount <= 0 || !Number.isInteger(amount)) {
      return errorResponse('amount 必须为正整数', 400)
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return errorResponse('作废原因必填', 400)
    }

    const result = await PointsService.voidPoints(admin.id, userId, amount, reason.trim())

    return successResponse(result, '积分作废成功')
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '积分作废失败'
    const status = message.includes('不存在') || message.includes('必填') || message.includes('必须大于') || message.includes('不足')
      ? 400 : 500
    return errorResponse(message, status)
  }
}
