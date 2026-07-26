import { prisma } from "@/lib/prisma"

// ---- Types ----

export interface DashboardYesterdayReport {
  date: string
  orders: { count: number; lastWeekCount: number; vsLastWeek: number }
  sales: { amount: number; lastWeekAmount: number; vsLastWeek: number }
  newUsers: { count: number; lastWeekCount: number; vsLastWeek: number }
  refunds: { count: number; amount: number; lastWeekCount: number; lastWeekAmount: number; vsLastWeek: number }
  withdrawals: { count: number; amount: number; lastWeekCount: number; lastWeekAmount: number; vsLastWeek: number }
}

export interface DashboardPending {
  refund: number
  withdrawal: number
  shipment: number
  lowStock: number
  total: number
}

export interface LowStockProduct {
  id: string
  name: string
  stock: number
  sortOrder: number
}

export interface DashboardSummary {
  yesterdayReport: DashboardYesterdayReport
  pending: DashboardPending
  lowStockProducts: LowStockProduct[]
  timestamp: string
}

export interface SalesStats {
  today: number
  week: number
  month: number
  total: number
  todayVsYesterday: number
  weekVsLastWeek: number
  monthVsLastMonth: number
}

export interface OrderStats {
  today: number
  pending: number
  total: number
  todayVsYesterday: number
}

export interface UserStats {
  todayNew: number
  total: number
  active7d: number
  todayNewVsYesterday: number
}

export interface ProductStats {
  total: number
  lowStock: number
}

export interface StatsData {
  sales: SalesStats
  orders: OrderStats
  users: UserStats
  products: ProductStats
  refundPending: number
}

export interface TrendItem {
  date: string
  sales: number
  orderCount: number
}

// ---- Helpers ----

const PAID_STATUSES = ["paid", "shipped", "completed"]
const LOW_STOCK_THRESHOLD = 10

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function calcPct(current: number, baseline: number): number {
  if (baseline === 0) return current > 0 ? 100 : 0
  return Math.round(((current - baseline) / baseline) * 100)
}

function calcDelta(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100 * 10) / 10
}

// ---- Service ----

export class StatsService {
  /**
   * D-5.6: Dashboard summary — yesterday report + pending items + low stock
   * Migrated from src/app/api/admin/dashboard/summary/route.ts
   */
  static async getDashboardSummary(): Promise<DashboardSummary> {
    const now = new Date()
    const yestStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0)
    const yestEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const lastWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 8, 0, 0, 0, 0)
    const lastWeekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 0, 0, 0, 0)

    const paidFullStatuses = ["paid", "shipped", "completed", "refunded"]

    const [
      yestOrderAgg, lastWeekOrderAgg,
      yestOrderCount, lastWeekOrderCount,
      yestUserCount, lastWeekUserCount,
      yestRefundAgg, lastWeekRefundAgg,
      yestRefundCount, lastWeekRefundCount,
      yestWithdrawalAgg, lastWeekWithdrawalAgg,
      yestWithdrawalCount, lastWeekWithdrawalCount,
      pendingRefundCount, pendingWithdrawalCount,
      pendingShipmentCount, lowStockProducts,
    ] = await Promise.all([
      prisma.order.aggregate({ _sum: { payAmount: true }, _count: { id: true }, where: { status: { in: paidFullStatuses }, createdAt: { gte: yestStart, lt: yestEnd } } }),
      prisma.order.aggregate({ _sum: { payAmount: true }, _count: { id: true }, where: { status: { in: paidFullStatuses }, createdAt: { gte: lastWeekStart, lt: lastWeekEnd } } }),
      prisma.order.count({ where: { createdAt: { gte: yestStart, lt: yestEnd } } }),
      prisma.order.count({ where: { createdAt: { gte: lastWeekStart, lt: lastWeekEnd } } }),
      prisma.user.count({ where: { createdAt: { gte: yestStart, lt: yestEnd } } }),
      prisma.user.count({ where: { createdAt: { gte: lastWeekStart, lt: lastWeekEnd } } }),
      prisma.refundRequest.aggregate({ _sum: { amount: true }, _count: { id: true }, where: { status: "pending", createdAt: { gte: yestStart, lt: yestEnd } } }),
      prisma.refundRequest.aggregate({ _sum: { amount: true }, _count: { id: true }, where: { status: "pending", createdAt: { gte: lastWeekStart, lt: lastWeekEnd } } }),
      prisma.refundRequest.count({ where: { createdAt: { gte: yestStart, lt: yestEnd } } }),
      prisma.refundRequest.count({ where: { createdAt: { gte: lastWeekStart, lt: lastWeekEnd } } }),
      prisma.withdrawal.aggregate({ _sum: { amount: true }, _count: { id: true }, where: { status: "pending", createdAt: { gte: yestStart, lt: yestEnd } } }),
      prisma.withdrawal.aggregate({ _sum: { amount: true }, _count: { id: true }, where: { status: "pending", createdAt: { gte: lastWeekStart, lt: lastWeekEnd } } }),
      prisma.withdrawal.count({ where: { createdAt: { gte: yestStart, lt: yestEnd } } }),
      prisma.withdrawal.count({ where: { createdAt: { gte: lastWeekStart, lt: lastWeekEnd } } }),
      prisma.refundRequest.count({ where: { status: "pending" } }),
      prisma.withdrawal.count({ where: { status: "pending" } }),
      prisma.order.count({ where: { status: "paid", paidAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) }, shippedAt: null } }),
      prisma.product.findMany({ where: { stock: { lte: LOW_STOCK_THRESHOLD } }, select: { id: true, name: true, stock: true, sortOrder: true }, orderBy: { stock: "asc" }, take: 20 }),
    ])

    const yesterdayReport: DashboardYesterdayReport = {
      date: yestStart.toISOString().slice(0, 10),
      orders: { count: yestOrderCount, lastWeekCount: lastWeekOrderCount, vsLastWeek: calcPct(yestOrderCount, lastWeekOrderCount) },
      sales: { amount: yestOrderAgg._sum.payAmount || 0, lastWeekAmount: lastWeekOrderAgg._sum.payAmount || 0, vsLastWeek: calcPct(yestOrderAgg._sum.payAmount || 0, lastWeekOrderAgg._sum.payAmount || 0) },
      newUsers: { count: yestUserCount, lastWeekCount: lastWeekUserCount, vsLastWeek: calcPct(yestUserCount, lastWeekUserCount) },
      refunds: { count: yestRefundCount, amount: yestRefundAgg._sum.amount || 0, lastWeekCount: lastWeekRefundCount, lastWeekAmount: lastWeekRefundAgg._sum.amount || 0, vsLastWeek: calcPct(yestRefundCount, lastWeekRefundCount) },
      withdrawals: { count: yestWithdrawalCount, amount: yestWithdrawalAgg._sum.amount || 0, lastWeekCount: lastWeekWithdrawalCount, lastWeekAmount: lastWeekWithdrawalAgg._sum.amount || 0, vsLastWeek: calcPct(yestWithdrawalCount, lastWeekWithdrawalCount) },
    }

    const pending: DashboardPending = {
      refund: pendingRefundCount,
      withdrawal: pendingWithdrawalCount,
      shipment: pendingShipmentCount,
      lowStock: lowStockProducts.length,
      total: pendingRefundCount + pendingWithdrawalCount + pendingShipmentCount + lowStockProducts.length,
    }

    return { yesterdayReport, pending, lowStockProducts, timestamp: now.toISOString() }
  }

  /**
   * D-5.6: Admin stats — sales / orders / users / products overview
   * Migrated from src/app/api/admin/stats/route.ts (computeStats)
   */
  static async getStats(): Promise<StatsData> {
    const now = new Date()
    const todayStart = startOfDay(now)
    const weekStart = startOfWeek(now)
    const monthStart = startOfMonth(now)
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const yesterdayStart = new Date(todayStart)
    yesterdayStart.setDate(yesterdayStart.getDate() - 1)
    const lastWeekEnd = new Date(weekStart)
    const lastWeekStart = new Date(lastWeekEnd)
    lastWeekStart.setDate(lastWeekStart.getDate() - 7)
    const lastMonthEnd = new Date(monthStart)
    const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth() - 1, 1)

    const [
      todaySales, yesterdaySales,
      weekSales, lastWeekSales,
      monthSales, lastMonthSales,
      totalSales,
      todayOrders, yesterdayOrders,
      pendingOrders, totalOrders,
      todayNewUsers, yesterdayNewUsers,
      totalUsers, activeOrders7d,
      totalProducts, lowStockProducts,
      refundPending,
    ] = await Promise.all([
      prisma.order.aggregate({ _sum: { payAmount: true }, where: { status: { in: PAID_STATUSES }, createdAt: { gte: todayStart } } }),
      prisma.order.aggregate({ _sum: { payAmount: true }, where: { status: { in: PAID_STATUSES }, createdAt: { gte: yesterdayStart, lt: todayStart } } }),
      prisma.order.aggregate({ _sum: { payAmount: true }, where: { status: { in: PAID_STATUSES }, createdAt: { gte: weekStart } } }),
      prisma.order.aggregate({ _sum: { payAmount: true }, where: { status: { in: PAID_STATUSES }, createdAt: { gte: lastWeekStart, lt: weekStart } } }),
      prisma.order.aggregate({ _sum: { payAmount: true }, where: { status: { in: PAID_STATUSES }, createdAt: { gte: monthStart } } }),
      prisma.order.aggregate({ _sum: { payAmount: true }, where: { status: { in: PAID_STATUSES }, createdAt: { gte: lastMonthStart, lt: monthStart } } }),
      prisma.order.aggregate({ _sum: { payAmount: true }, where: { status: { in: PAID_STATUSES } } }),
      prisma.order.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.order.count({ where: { createdAt: { gte: yesterdayStart, lt: todayStart } } }),
      prisma.order.count({ where: { status: { in: ["pending", "paid"] } } }),
      prisma.order.count(),
      prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.user.count({ where: { createdAt: { gte: yesterdayStart, lt: todayStart } } }),
      prisma.user.count(),
      prisma.order.findMany({ where: { createdAt: { gte: sevenDaysAgo } }, select: { userId: true }, distinct: ["userId"] }),
      prisma.product.count(),
      prisma.product.count({ where: { stock: { lt: 5 } } }),
      prisma.refundRequest.count({ where: { status: "pending" } }),
    ])

    const sales: SalesStats = {
      today: todaySales._sum.payAmount || 0,
      week: weekSales._sum.payAmount || 0,
      month: monthSales._sum.payAmount || 0,
      total: totalSales._sum.payAmount || 0,
      todayVsYesterday: calcDelta(todaySales._sum.payAmount || 0, yesterdaySales._sum.payAmount || 0),
      weekVsLastWeek: calcDelta(weekSales._sum.payAmount || 0, lastWeekSales._sum.payAmount || 0),
      monthVsLastMonth: calcDelta(monthSales._sum.payAmount || 0, lastMonthSales._sum.payAmount || 0),
    }

    const orders: OrderStats = {
      today: todayOrders,
      pending: pendingOrders,
      total: totalOrders,
      todayVsYesterday: calcDelta(todayOrders, yesterdayOrders),
    }

    const users: UserStats = {
      todayNew: todayNewUsers,
      total: totalUsers,
      active7d: activeOrders7d.length,
      todayNewVsYesterday: calcDelta(todayNewUsers, yesterdayNewUsers),
    }

    const products: ProductStats = { total: totalProducts, lowStock: lowStockProducts }

    return { sales, orders, users, products, refundPending }
  }

  /**
   * D-5.6: Trend data — daily sales + order count for the last N days
   * Migrated from src/app/api/admin/stats/trend/route.ts
   */
  static async getTrend(days: number): Promise<TrendItem[]> {
    const now = new Date()
    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() - days + 1)
    startDate.setHours(0, 0, 0, 0)

    const orders = await prisma.order.findMany({
      where: { status: { in: PAID_STATUSES }, createdAt: { gte: startDate } },
      select: { payAmount: true, createdAt: true },
    })

    const dateMap = new Map<string, TrendItem>()
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate)
      d.setDate(d.getDate() + i)
      const key = d.toISOString().slice(0, 10)
      dateMap.set(key, { date: key, sales: 0, orderCount: 0 })
    }

    for (const order of orders) {
      const key = order.createdAt.toISOString().slice(0, 10)
      const item = dateMap.get(key)
      if (item) {
        item.sales += order.payAmount
        item.orderCount += 1
      }
    }

    return Array.from(dateMap.values())
  }
}
