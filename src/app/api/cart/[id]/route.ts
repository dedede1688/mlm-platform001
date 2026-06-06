import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { prisma } from '@/lib/prisma'

// DELETE /api/cart/[id] - 删除购物车中指定项
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }

    const { id } = await params

    // 查找购物车项，确保属于当前用户
    const cartItem = await prisma.cart.findUnique({
      where: { id },
    })

    if (!cartItem) {
      return NextResponse.json({ error: '购物车项不存在' }, { status: 404 })
    }

    if (cartItem.userId !== user.userId) {
      return NextResponse.json({ error: '无权操作' }, { status: 403 })
    }

    await prisma.cart.delete({
      where: { id },
    })

    return NextResponse.json({
      success: true,
      message: '已从购物车移除',
    })
  } catch (error) {
    console.error('删除购物车项失败:', error)
    return NextResponse.json({ error: '删除购物车项失败' }, { status: 500 })
  }
}