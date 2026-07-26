import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { logger } from '@/lib/logger'
import { OrderLifecycleService } from '@/lib/services/order-lifecycle.service'
import { validateRefundApplication } from '@/lib/refunds/refund-validation'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params
  try {
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const validation = validateRefundApplication({
      reason: body?.reason,
      description: body?.description,
      images: body?.images,
    })

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      )
    }

    const normalized = validation.data
    const refundRequest = await OrderLifecycleService.createRefundRequest(orderId, user.userId, {
      reason: normalized.reason,
      description: normalized.description ?? '',
      images: normalized.images ?? [],
    })

    return NextResponse.json({
      success: true,
      data: refundRequest,
      message: '退款申请已提交',
    })
  } catch (error) {
    logger.error('Create refund request error:', error)
    const msg = error instanceof Error ? error.message : '申请退款失败'
    return NextResponse.json(
      { success: false, error: msg },
      { status: 400 }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params
  try {
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      )
    }

    const refundRequests = await OrderLifecycleService.getOrderRefunds(orderId, user.userId, user.role)

    return NextResponse.json({
      success: true,
      data: refundRequests,
    })
  } catch (error) {
    logger.error('Get refund requests error:', error)
    const msg = error instanceof Error ? error.message : '获取退款申请失败'
    return NextResponse.json(
      { success: false, error: msg },
      { status: 403 }
    )
  }
}