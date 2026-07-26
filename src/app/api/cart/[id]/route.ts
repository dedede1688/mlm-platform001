import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { CartService } from '@/lib/services/cart.service'
import { logger } from '@/lib/logger'

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

    await CartService.deleteItem(user.userId, id)

    return NextResponse.json({
      success: true,
      message: '已从购物车移除',
    })
  } catch (error) {
    logger.error('删除购物车项失败:', error)
    const message = error instanceof Error ? error.message : '删除购物车项失败'
    const statusCode = (error as Record<string, unknown>)?.statusCode as number || 500
    return NextResponse.json({ error: message }, { status: statusCode })
  }
}
