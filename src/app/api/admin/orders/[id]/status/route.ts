import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'
import { logOperation } from '@/lib/utils/operation-log'

// 合法的状态流转规则
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['paid', 'cancelled'],
  paid: ['shipped', 'cancelled'],
  shipped: ['completed'],
}

const ALLOWED_STATUSES = ['paid', 'shipped', 'completed', 'cancelled']

// PATCH /api/admin/orders/[id]/status — 管理员修改订单状态
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin', 'goods_admin'])
    if (authError || !admin) return authError!

    const { id } = await params

    // 查询当前订单
    const order = await prisma.order.findUnique({ where: { id } })
    if (!order) {
      return NextResponse.json(
        { success: false, error: '订单不存在' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { status, trackingNumber } = body as { status?: string; trackingNumber?: string }

    // 验证 status 参数
    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json(
        { success: false, error: `status 只能为 ${ALLOWED_STATUSES.join('/')}` },
        { status: 400 }
      )
    }

    // 校验状态流转是否合法
    const allowedNext = VALID_TRANSITIONS[order.status]
    if (!allowedNext || !allowedNext.includes(status)) {
      return NextResponse.json(
        { success: false, error: `订单状态 ${order.status} 不可变更为 ${status}` },
        { status: 400 }
      )
    }

    // 构建更新数据
    const data: Record<string, unknown> = { status }

    if (status === 'paid' && !order.paidAt) {
      data.paidAt = new Date()
    }

    if (status === 'shipped') {
      if (!order.shippedAt) {
        data.shippedAt = new Date()
      }
      if (trackingNumber && typeof trackingNumber === 'string') {
        data.trackingNumber = trackingNumber.trim()
      }
    }

    if (status === 'completed') {
      data.completedAt = new Date()
    }

    if (status === 'cancelled') {
      data.cancelledAt = new Date()
    }

    const updated = await prisma.order.update({
      where: { id },
      data,
    })

    // 记录操作日志
    await logOperation({
      userId: admin.id,
      action: 'UPDATE',
      module: 'order',
      targetId: id,
      oldValue: { status: order.status },
      newValue: data,
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    return NextResponse.json({
      success: true,
      data: updated,
    })
  } catch (error) {
    console.error('Admin update order status error:', error)
    return NextResponse.json(
      { success: false, error: '修改订单状态失败' },
      { status: 500 }
    )
  }
}