import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'
import { logOperation } from '@/lib/utils/operation-log'
import { OrderService } from '@/lib/services/order.service'

// GET /api/admin/orders/[id] — 获取单个订单详情（管理员）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['goods_admin', 'super_admin'])
    if (authError || !admin) return authError!

    const { id } = await params
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            phone: true,
            nickname: true,
            level: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                imageUrl: true,
                retailPrice: true,
                memberPrice: true,
              },
            },
          },
        },
        rewards: {
          select: {
            id: true,
            type: true,
            amount: true,
            status: true,
            fromUserId: true,
            level: true,
          },
        },
      },
    })

    if (!order) {
      return NextResponse.json(
        { success: false, message: '订单不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: order,
      message: '获取订单详情成功',
    })
  } catch (error) {
    console.error('Admin get order error:', error)
    return NextResponse.json(
      { success: false, message: '获取订单详情失败' },
      { status: 500 }
    )
  }
}

// PUT /api/admin/orders/[id] — 更新订单状态（管理员）
// 目前支持：标记发货（action=ship, 需提供 trackingNumber）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['goods_admin', 'super_admin'])
    if (authError || !admin) return authError!

    const { id } = await params
    const body = await request.json()
    const { action, trackingNumber } = body

    // 检查订单是否存在
    const order = await prisma.order.findUnique({ where: { id } })
    if (!order) {
      return NextResponse.json(
        { success: false, message: '订单不存在' },
        { status: 404 }
      )
    }

    // 根据操作类型处理
    if (action === 'ship') {
      // 标记发货
      if (order.status !== 'paid') {
        return NextResponse.json(
          { success: false, message: '只有已付款的订单才能发货' },
          { status: 400 }
        )
      }

      if (!trackingNumber || typeof trackingNumber !== 'string' || !trackingNumber.trim()) {
        return NextResponse.json(
          { success: false, message: '物流单号不能为空' },
          { status: 400 }
        )
      }

      const updatedOrder = await prisma.order.update({
        where: { id },
        data: {
          status: 'shipped',
          shippedAt: new Date(),
          trackingNumber: trackingNumber.trim(),
        },
        include: {
          user: {
            select: {
              id: true,
              phone: true,
              nickname: true,
            },
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  imageUrl: true,
                },
              },
            },
          },
        },
      })

      // 记录操作日志
      await logOperation({
        userId: admin.id,
        action: 'UPDATE',
        module: 'order',
        targetId: id,
        oldValue: { status: order.status },
        newValue: { status: 'shipped', trackingNumber: trackingNumber.trim() },
        ip: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      })

      // v46.10.3: 触发订单发货通知（修复 admin/orders PUT 不调 shipOrder 导致的 IIFE 死代码）
      await OrderService.notifyOrderShipped(id)

      return NextResponse.json({
        success: true,
        data: updatedOrder,
        message: '发货成功',
      })
    }

    // 未知操作
    return NextResponse.json(
      { success: false, message: `不支持的操作: ${action}` },
      { status: 400 }
    )
  } catch (error) {
    console.error('Admin update order error:', error)
    return NextResponse.json(
      { success: false, message: '更新订单失败' },
      { status: 500 }
    )
  }
}