import { NextRequest } from 'next/server'
import { errorResponse, successResponse } from '@/lib/api-response'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { RechargeService } from '@/lib/services/recharge.service'
import { logger } from '@/lib/logger'

/**
 * GET /api/admin/recharge
 * 后台充值申请列表（管理员）
 * 支持分页、状态筛选、支付方式筛选、用户搜索
 * 权限：finance_admin, super_admin
 */
export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await verifyPermission(request, [
      'finance_admin',
      'super_admin',
    ])
    if (authError) return authError

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20')))
    const status = searchParams.get('status')?.trim() || undefined
    const paymentMethod = searchParams.get('paymentMethod')?.trim() || undefined
    const search = searchParams.get('search')?.trim() || undefined

    const result = await RechargeService.listAdminRechargeRequests({
      page,
      pageSize,
      status,
      paymentMethod,
      search,
    })

    return successResponse({ records: result.data, pagination: result.pagination })
  } catch (error) {
    logger.error('Admin get recharge list error:', error)
    return errorResponse('获取充值申请列表失败', 500)
  }
}
