import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { PointsService } from '@/lib/services/points.service'

// POST /api/admin/points/void — 管理员作废用户积分
export async function POST(request: NextRequest) {
  try {
    // 鉴权：仅 super_admin 和 points_admin
    const { user: admin, error: authError } = await verifyPermission(
      request, ['super_admin', 'points_admin']
    )
    if (authError || !admin) return authError!

    const body = await request.json()
    const { userId, amount, reason } = body

    // 参数校验
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'userId 必填' },
        { status: 400 }
      )
    }

    if (typeof amount !== 'number' || amount <= 0 || !Number.isInteger(amount)) {
      return NextResponse.json(
        { success: false, error: 'amount 必须为正整数' },
        { status: 400 }
      )
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: '作废原因必填' },
        { status: 400 }
      )
    }

    const result = await PointsService.voidPoints(admin.id, userId, amount, reason.trim())

    return NextResponse.json({
      success: true,
      data: result,
      message: '积分作废成功',
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '积分作废失败'
    const status = message.includes('不存在') || message.includes('必填') || message.includes('必须大于') || message.includes('不足')
      ? 400 : 500
    return NextResponse.json(
      { success: false, error: message },
      { status }
    )
  }
}