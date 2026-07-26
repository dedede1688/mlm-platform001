import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { logger } from '@/lib/logger'
import { OrderLifecycleService } from '@/lib/services/order-lifecycle.service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    await OrderLifecycleService.confirmOrder(id, user.userId)

    return NextResponse.json({
      success: true,
      message: '确认收货成功',
    })
  } catch (error: unknown) {
    logger.error('Confirm order error:', error)
    const msg = error instanceof Error ? error.message : '确认收货失败'
    return NextResponse.json(
      { error: msg },
      { status: 400 }
    )
  }
}