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
}

interface OrderStats {
  today: number
  pending: number
  total: number
}

interface UserStats {
  todayNew: number
  total: number
  active7d: number
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

// ---- GET /api/admin/stats ----

export async function GET(request: NextRequest) {
  // 权限校验
  const admin = await verifyPermission(request, ['admin', 'super_admin'])
  if (!admin) {
    return NextResponse.json(
      { success: false, error: '无权访问' },
      { status: 403 }
    )
  }

  try {
    const now = new Date()
    const todayStart = startOfDay(now)
    const weekStart = startOfWeek(now)
    const monthStart = startOfMonth(now)
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    // 已支付/已完成的订单条件
    const paidStatuses = ['paid', 'shipped', 'completed']

    // ---- 销售概览 ----
    const [todaySales, weekSales, monthSales, totalSales] = await Promise.all([
      prisma.order.aggregate({
        _sum: { payAmount: true },
        where: { status: { in: paidStatuses }, createdAt: { gte: todayStart } },
      }),
      prisma.order.aggregate({
        _sum: { payAmount: true },
        where: { status: { in: paidStatuses }, createdAt: { gte: weekStart } },
      }),
      prisma.order.aggregate({
        _sum: { payAmount: true },
        where: { status: { in: paidStatuses }, createdAt: { gte: monthStart } },
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
    }

    // ---- 订单统计 ----
    const [todayOrders, pendingOrders, totalOrders] = await Promise.all([
      prisma.order.count({
        where: { createdAt: { gte: todayStart } },
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
    }

    // ---- 用户统计 ----
    const [todayNewUsers, totalUsers, activeOrders7d] = await Promise.all([
      prisma.user.count({
        where: { createdAt: { gte: todayStart } },
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