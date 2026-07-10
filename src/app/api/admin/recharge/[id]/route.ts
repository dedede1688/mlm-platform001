import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { RechargeService } from '@/lib/services/recharge.service'

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
      return NextResponse.json(
        { success: false, message: '充值申请不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Admin get recharge detail error:', error)
    return NextResponse.json(
      { success: false, message: '获取充值申请详情失败' },
      { status: 500 }
    )
  }
}
