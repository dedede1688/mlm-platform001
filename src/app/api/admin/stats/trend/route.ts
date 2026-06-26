import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPermission } from '@/lib/utils/admin-auth'

// ---- 类型 ----

interface TrendItem {
  date: string
  sales: number
  orderCount: number
}

// ---- GET /api/admin/stats/trend?days=7 ----

export async function GET(request: NextRequest) {
  const { user: admin, error: authError } = await verifyPermission(request, ['super_admin', 'finance_admin', 'goods_admin', 'support_admin', 'auditor'])
  if (authError || !admin) return authError!

  try {
    const { searchParams } = new URL(request.url)
    const days = Math.min(Math.max(Number(searchParams.get('days')) || 7, 1), 90)

    const now = new Date()
    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() - days + 1)
    startDate.setHours(0, 0, 0, 0)

    // 查询范围内已支付订单
    const paidStatuses = ['paid', 'shipped', 'completed']
    const orders = await prisma.order.findMany({
      where: {
        status: { in: paidStatuses },
        createdAt: { gte: startDate },
      },
      select: {
        payAmount: true,
        createdAt: true,
      },
    })

    // 初始化每天数据
    const dateMap = new Map<string, TrendItem>()
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate)
      d.setDate(d.getDate() + i)
      const key = d.toISOString().slice(0, 10)
      dateMap.set(key, { date: key, sales: 0, orderCount: 0 })
    }

    // 按天聚合
    for (const order of orders) {
      const key = order.createdAt.toISOString().slice(0, 10)
      const item = dateMap.get(key)
      if (item) {
        item.sales += order.payAmount
        item.orderCount += 1
      }
    }

    const data = Array.from(dateMap.values())

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('获取趋势数据失败:', error)
    return NextResponse.json(
      { success: false, error: '获取趋势数据失败' },
      { status: 500 }
    )
  }
}