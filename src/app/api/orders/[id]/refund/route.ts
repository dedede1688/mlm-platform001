import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { OrderNotificationService } from '@/lib/services/order-notification.service'

// POST /api/orders/[id]/refund — 用户申请退款
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

    // 查询订单
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        status: true,
        payAmount: true,
      },
    })

    if (!order) {
      return NextResponse.json(
        { success: false, error: '订单不存在' },
        { status: 404 }
      )
    }

    // 权限校验：只能操作自己的订单
    if (order.userId !== user.userId) {
      return NextResponse.json(
        { success: false, error: '无权操作' },
        { status: 403 }
      )
    }

    // 状态校验：仅已支付或已发货可申请退款
    if (order.status !== 'paid' && order.status !== 'shipped') {
      return NextResponse.json(
        { success: false, error: '当前订单状态不可申请退款' },
        { status: 400 }
      )
    }

    // 检查是否已有进行中的退款申请（pending 或 approved，防重复）
    const existingActiveRefund = await prisma.refundRequest.findFirst({
      where: { orderId, status: { in: ['pending', 'approved'] } },
    })
    if (existingActiveRefund) {
      return NextResponse.json(
        { success: false, error: '该订单已有进行中的退款申请' },
        { status: 400 }
      )
    }

    // 解析请求体
    const body = await request.json()
    const { reason, description, images } = body as {
      reason: string
      description?: string
      images?: string[]
    }

    if (!reason || !reason.trim()) {
      return NextResponse.json(
        { success: false, error: '退款原因不能为空' },
        { status: 400 }
      )
    }

    // 创建退款申请
    const refundRequest = await prisma.refundRequest.create({
      data: {
        orderId,
        userId: user.userId,
        amount: order.payAmount,
        reason: reason.trim(),
        description: description?.trim() || null,
        images: images && images.length > 0 ? images : Prisma.JsonNull,
        status: 'pending',
      },
    })

    // v50 M: 触发退款申请通知（补全退款流程第 1 个节点通知）
    const orderForNotify = await prisma.order.findUnique({
      where: { id: orderId },
      select: { orderNo: true },
    })
    await OrderNotificationService.notifyRefundSubmitted({
      userId: user.userId,
      refundId: refundRequest.id,
      orderId,
      orderNo: orderForNotify?.orderNo || orderId,
      amount: order.payAmount,
    })

    return NextResponse.json({
      success: true,
      data: refundRequest,
      message: '退款申请已提交',
    })
  } catch (error) {
    console.error('Create refund request error:', error)
    return NextResponse.json(
      { success: false, error: '申请退款失败' },
      { status: 500 }
    )
  }
}

// GET /api/orders/[id]/refund — 查询订单的退款申请
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

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { userId: true },
    })

    if (!order) {
      return NextResponse.json(
        { success: false, error: '订单不存在' },
        { status: 404 }
      )
    }

    if (order.userId !== user.userId && !['super_admin', 'goods_admin', 'finance_admin', 'support_admin', 'auditor'].includes(user.role || '')) {
      return NextResponse.json(
        { success: false, error: '无权查看' },
        { status: 403 }
      )
    }

    const refundRequests = await prisma.refundRequest.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      success: true,
      data: refundRequests,
    })
  } catch (error) {
    console.error('Get refund requests error:', error)
    return NextResponse.json(
      { success: false, error: '获取退款申请失败' },
      { status: 500 }
    )
  }
}