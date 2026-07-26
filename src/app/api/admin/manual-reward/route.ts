import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { RewardService } from '@/lib/services/reward.service'
import { logOperation } from '@/lib/utils/operation-log'
import { OrderNotificationService } from '@/lib/services/order-notification.service'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['finance_admin', 'super_admin'])
    if (authError || !admin) return authError!

    const { userId, amount, type, reason } = await request.json()

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { success: false, message: '缺少用户 ID' },
        { status: 400 }
      )
    }

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { success: false, message: '金额必须大于 0' },
        { status: 400 }
      )
    }

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return NextResponse.json(
        { success: false, message: '发放原因不能为空' },
        { status: 400 }
      )
    }

    const result = await RewardService.createManualReward({
      userId,
      adminId: admin.id,
      amount,
      type: type || undefined,
      reason: reason.trim(),
    })

    await logOperation({
      userId: admin.id,
      action: 'CREATE',
      module: 'finance',
      targetId: result.reward.id,
      newValue: { userId, amount, type: type || 'manual', reason: reason.trim() },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    await OrderNotificationService.notifyManualReward({
      userId,
      amount,
      reason: reason.trim(),
      operatorId: admin.id,
    })

    return NextResponse.json({
      success: true,
      data: result,
      message: `已向用户发放 ¥${amount.toFixed(2)} 奖励`,
    })
  } catch (error) {
    logger.error('Admin manual reward error:', error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : '手动发放奖励失败' },
      { status: error instanceof Error && error.message === '用户不存在' ? 404 : 500 }
    )
  }
}
