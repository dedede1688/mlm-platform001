import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPermission } from '@/lib/utils/admin-auth'

// ---- 时间边界工具 ----

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  // 周一为一周起点
  const diff = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

// ---- 接口类型 ----

interface SalesStats {
  today: number
  week: number
  month: number
  total: number
  // v51.0: 环比% 字段（与上一周期对比，正数=增长，负数=下降）
  todayVsYesterday: number   // 今日 vs 昨日百分比变化
  weekVsLastWeek: number     // 本周 vs 上周
  monthVsLastMonth: number   // 本月 vs 上月
}

interface OrderStats {
  today: number
  pending: number
  total: number
  // v51.0: 环比% 字段
  todayVsYesterday: number   // 今日订单数 vs 昨日
}

interface UserStats {
  todayNew: number
  total: number
  active7d: number
  // v51.0: 环比% 字段
  todayNewVsYesterday: number  // 今日新增用户 vs 昨日
}

interface ProductStats {
  total: number
  lowStock: number
}

interface StatsData {
  sales: SalesStats
  orders: OrderStats
  users: UserStats
  products: ProductStats
  refundPending: number
}

// ---- 计算环比% ----

function calcDelta(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100 * 10) / 10
}

// ---- GET /api/admin/stats ----

export async function GET(request: NextRequest) {
  // 权限校验
  const { user: admin, error: authError } = await verifyPermission(request, ['super_admin', 'finance_admin', 'goods_admin', 'support_admin', 'auditor'])
  if (authError || !admin) return authError!

  try {
    const now = new Date()
    const todayStart = startOfDay(now)
    const weekStart = startOfWeek(now)
    const monthStart = startOfMonth(now)
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    // ---- 环比对比范围 ----
    const yesterdayStart = new Date(todayStart)
    yesterdayStart.setDate(yesterdayStart.getDate() - 1)

    const lastWeekEnd = new Date(weekStart)  // 本周一 = 上周日结束
    const lastWeekStart = new Date(lastWeekEnd)
    lastWeekStart.setDate(lastWeekStart.getDate() - 7)

    const lastMonthEnd = new Date(monthStart)  // 本月 1 号 = 上月结束
    const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth() - 1, 1)

    // 已支付/已完成的订单条件
    const paidStatuses = ['paid', 'shipped', 'completed']

    // ---- 销售概览（本期 + 上期）----
    const [
      todaySales, yesterdaySales,
      weekSales, lastWeekSales,
      monthSales, lastMonthSales,
      totalSales,
    ] = await Promise.all([
      prisma.order.aggregate({
        _sum: { payAmount: true },
        where: { status: { in: paidStatuses }, createdAt: { gte: todayStart } },
      }),
      prisma.order.aggregate({
        _sum: { payAmount: true },
        where: { status: { in: paidStatuses }, createdAt: { gte: yesterdayStart, lt: todayStart } },
      }),
      prisma.order.aggregate({
        _sum: { payAmount: true },
        where: { status: { in: paidStatuses }, createdAt: { gte: weekStart } },
      }),
      prisma.order.aggregate({
        _sum: { payAmount: true },
        where: { status: { in: paidStatuses }, createdAt: { gte: lastWeekStart, lt: weekStart } },
      }),
      prisma.order.aggregate({
        _sum: { payAmount: true },
        where: { status: { in: paidStatuses }, createdAt: { gte: monthStart } },
      }),
      prisma.order.aggregate({
        _sum: { payAmount: true },
        where: { status: { in: paidStatuses }, createdAt: { gte: lastMonthStart, lt: monthStart } },
      }),
      prisma.order.aggregate({
        _sum: { payAmount: true },
        where: { status: { in: paidStatuses } },
      }),
    ])

    const sales: SalesStats = {
      today: todaySales._sum.payAmount || 0,
      week: weekSales._sum.payAmount || 0,
      month: monthSales._sum.payAmount || 0,
      total: totalSales._sum.payAmount || 0,
      // v51.0: 环比% = ((当前 - 上期) / 上期) * 100
      todayVsYesterday: calcDelta(todaySales._sum.payAmount || 0, yesterdaySales._sum.payAmount || 0),
      weekVsLastWeek: calcDelta(weekSales._sum.payAmount || 0, lastWeekSales._sum.payAmount || 0),
      monthVsLastMonth: calcDelta(monthSales._sum.payAmount || 0, lastMonthSales._sum.payAmount || 0),
    }

    // ---- 订单统计（本期 + 上期）----
    const [
      todayOrders, yesterdayOrders,
      pendingOrders, totalOrders,
    ] = await Promise.all([
      prisma.order.count({
        where: { createdAt: { gte: todayStart } },
      }),
      prisma.order.count({
        where: { createdAt: { gte: yesterdayStart, lt: todayStart } },
      }),
      prisma.order.count({
        where: { status: { in: ['pending', 'paid'] } },
      }),
      prisma.order.count(),
    ])

    const orders: OrderStats = {
      today: todayOrders,
      pending: pendingOrders,
      total: totalOrders,
      todayVsYesterday: calcDelta(todayOrders, yesterdayOrders),
    }

    // ---- 用户统计（本期 + 上期）----
    const [todayNewUsers, yesterdayNewUsers, totalUsers, activeOrders7d] = await Promise.all([
      prisma.user.count({
        where: { createdAt: { gte: todayStart } },
      }),
      prisma.user.count({
        where: { createdAt: { gte: yesterdayStart, lt: todayStart } },
      }),
      prisma.user.count(),
      prisma.order.findMany({
        where: { createdAt: { gte: sevenDaysAgo } },
        select: { userId: true },
        distinct: ['userId'],
      }),
    ])

    const users: UserStats = {
      todayNew: todayNewUsers,
      total: totalUsers,
      active7d: activeOrders7d.length,
      todayNewVsYesterday: calcDelta(todayNewUsers, yesterdayNewUsers),
    }

    // ---- 商品统计 ----
    const [totalProducts, lowStockProducts] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({
        where: { stock: { lt: 5 } },
      }),
    ])

    const products: ProductStats = {
      total: totalProducts,
      lowStock: lowStockProducts,
    }

    // ---- 退款统计 ----
    const refundPending = await prisma.refundRequest.count({
      where: { status: 'pending' },
    })

    const data: StatsData = {
      sales,
      orders,
      users,
      products,
      refundPending,
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('获取统计数据失败:', error)
    return NextResponse.json(
      { success: false, error: '获取统计数据失败' },
      { status: 500 }
    )
  }
}
