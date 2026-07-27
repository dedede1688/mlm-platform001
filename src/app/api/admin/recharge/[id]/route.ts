import { NextRequest } from 'next/server'
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/utils/rate-limit"
import { errorResponse, successResponse } from '@/lib/api-response'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { RechargeService } from '@/lib/services/recharge.service'
import { logger } from '@/lib/logger'

/**
 * GET /api/admin/recharge/[id]
 * 后台充值申请详情（管理员）
 * 返回充值信息 + 用户信息 + 审核人信息
 * 权限：finance_admin, super_admin
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error: authError } = await verifyPermission(request, [
      'finance_admin',
      'super_admin',
    ])
    if (authError) return authError

    const { id } = await params
    const data = await RechargeService.getAdminRechargeRequestById(id)

    if (!data) {
      return errorResponse('充值申请不存在', 404)
    }

    return successResponse(data)
  } catch (error) {
    logger.error('Admin get recharge detail error:', error)
    return errorResponse('获取充值详情失败', 500)
  }
}
