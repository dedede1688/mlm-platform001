import { NextRequest } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'
import { toCsv, csvResponse } from '@/lib/utils/csv-export'

// GET /api/admin/reports/export/sales?days=30 — 销售数据 CSV 导出（v51.2）
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin', 'finance_admin', 'goods_admin'])
    if (authError || !admin) return authError!

    const { searchParams } = new URL(request.url)
    const days = Math.min(90, Math.max(1, parseInt(searchParams.get('days') || '30')))

    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1)
    const validStatuses = ['paid', 'shipped', 'completed']

    // TOP 商品 + TOP 会员（与 /api/admin/reports/sales 逻辑相同）
    const [orderItems, orders] = await Promise.all([
      prisma.orderItem.findMany({
        where: { order: { status: { in: validStatuses }, createdAt: { gte: startDate } } },
        select: { productId: true, quantity: true, totalPrice: true, product: { select: { name: true } } },
      }),
      prisma.order.findMany({
        where: { status: { in: validStatuses }, createdAt: { gte: startDate } },
        select: { userId: true, payAmount: true, user: { select: { phone: true, nickname: true, level: true } } },
      }),
    ])

    // 商品聚合
    const productMap = new Map<string, { name: string; sales: number; quantity: number; orderCount: number }>()
    for (const item of orderItems) {
      const ex = productMap.get(item.productId)
      if (ex) {
        ex.sales += item.totalPrice
        ex.quantity += item.quantity
        ex.orderCount += 1
      } else {
        productMap.set(item.productId, { name: item.product.name, sales: item.totalPrice, quantity: item.quantity, orderCount: 1 })
      }
    }
    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.sales - a.sales)
      .map(p => ({
        name: p.name,
        sales: (Math.round(p.sales * 100) / 100).toFixed(2),
        quantity: p.quantity,
        orderCount: p.orderCount,
      }))

    // 会员聚合
    const memberMap = new Map<string, { nickname: string | null; phone: string; level: number; sales: number; orderCount: number }>()
    for (const o of orders) {
      const ex = memberMap.get(o.userId)
      if (ex) {
        ex.sales += o.payAmount
        ex.orderCount += 1
      } else {
        memberMap.set(o.userId, {
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
      .map(m => ({
        nickname: m.nickname || '',
        phone: m.phone,
        level: `L${m.level}`,
        sales: (Math.round(m.sales * 100) / 100).toFixed(2),
        orderCount: m.orderCount,
      }))

    // CSV：合并两部分（加 section header）
    const productsCsv = toCsv(topProducts, [
      { key: 'name', label: '商品名称' },
      { key: 'sales', label: '销售额' },
      { key: 'quantity', label: '销量' },
      { key: 'orderCount', label: '订单数' },
    ])
    const membersCsv = toCsv(topMembers, [
      { key: 'nickname', label: '昵称' },
      { key: 'phone', label: '手机号' },
      { key: 'level', label: '等级' },
      { key: 'sales', label: '消费额' },
      { key: 'orderCount', label: '订单数' },
    ])
    const combined = `# TOP 商品（近${days}天）\n${productsCsv}\n# TOP 会员（近${days}天）\n${membersCsv}`

    const dateStr = now.toISOString().slice(0, 10)
    return csvResponse(combined, `销售报表_${days}天_${dateStr}`)
  } catch (error) {
    console.error('[Sales CSV Export Error]', error)
    return new Response('服务器错误', { status: 500 })
  }
}
