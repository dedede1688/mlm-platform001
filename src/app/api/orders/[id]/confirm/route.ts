import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/utils/auth'

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

    const order = await prisma.order.findUnique({ where: { id } })

    if (!order) {
      return NextResponse.json({ error: '订单不存在' }, { status: 404 })
    }

    if (order.userId !== user.userId) {
      return NextResponse.json({ error: '无权操作' }, { status: 403 })
    }

    if (order.status !== 'shipped') {
      return NextResponse.json({ error: '订单状态不允许确认收货' }, { status: 400 })
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { status: 'completed' },
    })

    return NextResponse.json({
      success: true,
      data: updatedOrder,
      message: '确认收货成功',
    })
  } catch (error: any) {
    console.error('Confirm order error:', error)
    return NextResponse.json(
      { error: '确认收货失败' },
      { status: 500 }
    )
  }
}