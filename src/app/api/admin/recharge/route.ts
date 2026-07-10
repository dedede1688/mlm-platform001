import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { RechargeService } from '@/lib/services/recharge.service'

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

    return NextResponse.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    })
  } catch (error) {
    console.error('Admin get recharge list error:', error)
    return NextResponse.json(
      { success: false, message: '获取充值申请列表失败' },
      { status: 500 }
    )
  }
}
