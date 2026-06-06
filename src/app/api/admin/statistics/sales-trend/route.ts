import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'

// GET /api/admin/statistics/sales-trend — 近N天销售额和订单量趋势
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin', 'goods_admin', 'finance_admin', 'support_admin', 'auditor'])
    if (authError || !admin) return authError!

    const { searchParams } = new URL(request.url)
    const days = Math.min(30, Math.max(1, parseInt(searchParams.get('days') || '7')))

    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1)

    // 有效订单状态
    const validStatuses = ['paid', 'shipped', 'completed']

    // 查询时间范围内所有有效订单
    const orders = await prisma.order.findMany({
      where: {
        status: { in: validStatuses },
        createdAt: { gte: startDate },
      },
      select: {
        payAmount: true,
        createdAt: true,
      },
    })

    // 按天分组
    const dailyMap = new Map<string, { sales: number; orderCount: number }>()

    // 初始化所有天（确保没有数据的天也有记录）
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate)
      d.setDate(d.getDate() + i)
      const key = formatDate(d)
      dailyMap.set(key, { sales: 0, orderCount: 0 })
    }

    // 累加订单数据
    for (const order of orders) {
      const key = formatDate(order.createdAt)
      const entry = dailyMap.get(key)
      if (entry) {
        entry.sales += order.payAmount
        entry.orderCount += 1
      }
    }

    // 转为数组并排序
    const result = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { sales, orderCount }]) => ({
        date,
        sales: Math.round(sales * 100) / 100,
        orderCount,
      }))

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('[Sales Trend Statistics Error]', error)
    return NextResponse.json(
      { success: false, message: '服务器错误' },
      { status: 500 }
    )
  }
}

/** 格式化日期为 YYYY-MM-DD */
function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}