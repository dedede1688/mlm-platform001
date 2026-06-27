import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'

// GET /api/admin/reports/sales — 销售报表（v51.1）
// 参数: ?days=30
// 返回: { topProducts, topMembers, trend }
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin', 'finance_admin', 'goods_admin'])
    if (authError || !admin) return authError!

    const { searchParams } = new URL(request.url)
    const days = Math.min(90, Math.max(1, parseInt(searchParams.get('days') || '30')))

    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1)
    const validStatuses = ['paid', 'shipped', 'completed']

    // ---- TOP 10 商品（按销售额）----
    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: { status: { in: validStatuses }, createdAt: { gte: startDate } },
      },
      select: {
        productId: true,
        quantity: true,
        unitPrice: true,
        totalPrice: true,
        product: { select: { id: true, name: true } },
      },
    })

    const productMap = new Map<string, { productId: string; name: string; sales: number; quantity: number; orderCount: number }>()
    for (const item of orderItems) {
      const existing = productMap.get(item.productId)
      if (existing) {
        existing.sales += item.totalPrice
        existing.quantity += item.quantity
        existing.orderCount += 1
      } else {
        productMap.set(item.productId, {
          productId: item.productId,
          name: item.product.name,
          sales: item.totalPrice,
          quantity: item.quantity,
          orderCount: 1,
        })
      }
    }
    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10)
      .map(p => ({
        ...p,
        sales: Math.round(p.sales * 100) / 100,
      }))

    // ---- TOP 10 会员（按消费额）----
    const orders = await prisma.order.findMany({
      where: {
        status: { in: validStatuses },
        createdAt: { gte: startDate },
      },
      select: {
        userId: true,
        payAmount: true,
        user: { select: { id: true, phone: true, nickname: true, level: true } },
      },
    })

    const memberMap = new Map<string, { userId: string; nickname: string | null; phone: string; level: number; sales: number; orderCount: number }>()
    for (const o of orders) {
      const existing = memberMap.get(o.userId)
      if (existing) {
        existing.sales += o.payAmount
        existing.orderCount += 1
      } else {
        memberMap.set(o.userId, {
          userId: o.userId,
          nickname: o.user.nickname,
          phone: o.user.phone,
          level: o.user.level,
          sales: o.payAmount,
          orderCount: 1,
        })
      }
    }
    const topMembers = Array.from(memberMap.values())
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10)
      .map(m => ({
        ...m,
        sales: Math.round(m.sales * 100) / 100,
      }))

    return NextResponse.json({ success: true, data: { topProducts, topMembers } })
  } catch (error) {
    console.error('[Sales Report Error]', error)
    return NextResponse.json(
      { success: false, message: '服务器错误' },
      { status: 500 }
    )
  }
}
