import { prisma } from "@/lib/prisma"

// ---- Types ----

export interface FinanceReport {
  income: number
  expense: number
  netIncome: number
  breakdown: { refundTotal: number; withdrawalTotal: number }
  period: { days: number; startDate: string; endDate: string }
}

export interface LevelDistItem { level: number; label: string; count: number }

export interface MembersReport {
  levelDistribution: LevelDistItem[]
  referrerRate: { withReferrer: number; total: number; rate: number }
  activity: {
    active7d: number; active30d: number; totalOrderUsers: number
    active7dRate: number; active30dRate: number; purchaseRate: number
  }
}

export interface TopProduct { productId: string; name: string; sales: number; quantity: number; orderCount: number }
export interface TopMember { userId: string; nickname: string | null; phone: string; level: number; sales: number; orderCount: number }

export interface SalesReport {
  topProducts: TopProduct[]
  topMembers: TopMember[]
}

export interface FunnelItem { level: number; key: string; label: string; count: number; color: string; parent: string | null }
export interface FunnelReport {
  funnel: FunnelItem[]
  rates: { firstOrderRate: number; repeatRate: number; threePlusRate: number; fivePlusRate: number }
}

// ---- Helpers ----

const VALID_STATUSES = ["paid", "shipped", "completed"]
const LEVEL_LABELS: Record<number, string> = { 1: "会员", 2: "经销商", 3: "主任", 4: "经理", 5: "总监", 6: "总裁", 7: "董事" }

function pct(a: number, b: number): number {
  return b > 0 ? Math.round((a / b) * 100 * 10) / 10 : 0
}

// ---- Service ----

export class ReportService {
  /**
   * D-5.7: 财务报告 — 收入/支出/净利润
   * Migrated from src/app/api/admin/reports/finance/route.ts
   */
  static async getFinanceReport(days: number): Promise<FinanceReport> {
    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1)

    const [incomeAgg, refundAgg, withdrawalAgg] = await Promise.all([
      prisma.order.aggregate({ _sum: { payAmount: true }, where: { status: { in: VALID_STATUSES }, createdAt: { gte: startDate } } }),
      prisma.refundRequest.aggregate({ _sum: { amount: true }, where: { status: "completed", updatedAt: { gte: startDate } } }),
      prisma.withdrawal.aggregate({ _sum: { amount: true }, where: { status: "completed", paidAt: { gte: startDate } } }),
    ])

    const income = incomeAgg._sum.payAmount || 0
    const refundTotal = refundAgg._sum.amount || 0
    const withdrawalTotal = withdrawalAgg._sum.amount || 0
    const expense = refundTotal + withdrawalTotal

    return {
      income: Math.round(income * 100) / 100,
      expense: Math.round(expense * 100) / 100,
      netIncome: Math.round((income - expense) * 100) / 100,
      breakdown: { refundTotal: Math.round(refundTotal * 100) / 100, withdrawalTotal: Math.round(withdrawalTotal * 100) / 100 },
      period: { days, startDate: startDate.toISOString().slice(0, 10), endDate: now.toISOString().slice(0, 10) },
    }
  }

  /**
   * D-5.7: 会员报告 — 等级分布/推荐转化率/活跃度
   * Migrated from src/app/api/admin/reports/members/route.ts
   */
  static async getMembersReport(): Promise<MembersReport> {
    const now = new Date()
    const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
    const thirtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)

    const [levelGroups, totalUsers, withReferrer, active7d, active30d, totalOrderUsers] = await Promise.all([
      prisma.user.groupBy({ by: ["level"], where: { status: { not: "deleted" } }, _count: { _all: true } }),
      prisma.user.count({ where: { status: { not: "deleted" } } }),
      prisma.user.count({ where: { status: { not: "deleted" }, referrerId: { not: null } } }),
      prisma.order.findMany({ where: { createdAt: { gte: sevenDaysAgo }, status: { in: VALID_STATUSES } }, select: { userId: true }, distinct: ["userId"] }),
      prisma.order.findMany({ where: { createdAt: { gte: thirtyDaysAgo }, status: { in: VALID_STATUSES } }, select: { userId: true }, distinct: ["userId"] }),
      prisma.order.findMany({ where: { status: { in: VALID_STATUSES } }, select: { userId: true }, distinct: ["userId"] }),
    ])

    const levelDistribution = levelGroups
      .map(g => ({ level: g.level, label: LEVEL_LABELS[g.level] || `L${g.level}`, count: g._count._all }))
      .sort((a, b) => a.level - b.level)

    const referrerRate = pct(withReferrer, totalUsers)

    const activity = {
      active7d: active7d.length,
      active30d: active30d.length,
      totalOrderUsers: totalOrderUsers.length,
      active7dRate: pct(active7d.length, totalUsers),
      active30dRate: pct(active30d.length, totalUsers),
      purchaseRate: pct(totalOrderUsers.length, totalUsers),
    }

    return { levelDistribution, referrerRate: { withReferrer, total: totalUsers, rate: referrerRate }, activity }
  }

  /**
   * D-5.7: 销售报告 — TOP 10 商品 / TOP 10 会员
   * Migrated from src/app/api/admin/reports/sales/route.ts
   */
  static async getSalesReport(days: number): Promise<SalesReport> {
    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1)

    const [orderItems, orders] = await Promise.all([
      prisma.orderItem.findMany({
        where: { order: { status: { in: VALID_STATUSES }, createdAt: { gte: startDate } } },
        select: { productId: true, quantity: true, unitPrice: true, totalPrice: true, product: { select: { id: true, name: true } } },
      }),
      prisma.order.findMany({
        where: { status: { in: VALID_STATUSES }, createdAt: { gte: startDate } },
        select: { userId: true, payAmount: true, user: { select: { id: true, phone: true, nickname: true, level: true } } },
      }),
    ])

    const productMap = new Map<string, TopProduct>()
    for (const item of orderItems) {
      const existing = productMap.get(item.productId)
      if (existing) {
        existing.sales += item.totalPrice; existing.quantity += item.quantity; existing.orderCount += 1
      } else {
        productMap.set(item.productId, { productId: item.productId, name: item.product.name, sales: item.totalPrice, quantity: item.quantity, orderCount: 1 })
      }
    }
    const topProducts = Array.from(productMap.values()).sort((a, b) => b.sales - a.sales).slice(0, 10).map(p => ({ ...p, sales: Math.round(p.sales * 100) / 100 }))

    const memberMap = new Map<string, TopMember>()
    for (const o of orders) {
      const existing = memberMap.get(o.userId)
      if (existing) { existing.sales += o.payAmount; existing.orderCount += 1 }
      else { memberMap.set(o.userId, { userId: o.userId, nickname: o.user.nickname, phone: o.user.phone, level: o.user.level, sales: o.payAmount, orderCount: 1 }) }
    }
    const topMembers = Array.from(memberMap.values()).sort((a, b) => b.sales - a.sales).slice(0, 10).map(m => ({ ...m, sales: Math.round(m.sales * 100) / 100 }))

    return { topProducts, topMembers }
  }

  /**
   * D-5.7: 转化漏斗 — 注册→首单→复购→3单→5单
   * Migrated from src/app/api/admin/reports/funnel/route.ts
   */
  static async getFunnelReport(): Promise<FunnelReport> {
    const [totalUsers, orderCounts] = await Promise.all([
      prisma.user.count({ where: { status: { not: "deleted" } } }),
      prisma.order.groupBy({ by: ["userId"], where: { status: { in: VALID_STATUSES } }, _count: { _all: true } }),
    ])

    const orderedUsers = orderCounts.length
    let repeatOrder = 0, threePlus = 0, fivePlus = 0
    for (const o of orderCounts) {
      const c = o._count._all
      if (c >= 2) repeatOrder++
      if (c >= 3) threePlus++
      if (c >= 5) fivePlus++
    }

    return {
      funnel: [
        { level: 1, key: "totalUsers", label: "注册用户", count: totalUsers, color: "bg-gray-500", parent: null },
        { level: 2, key: "orderedUsers", label: "下过单", count: orderedUsers, color: "bg-blue-500", parent: "totalUsers" },
        { level: 3, key: "repeatOrder", label: "复购用户（≥2 单）", count: repeatOrder, color: "bg-cyan-500", parent: "orderedUsers" },
        { level: 4, key: "threePlus", label: "3 单+ 用户", count: threePlus, color: "bg-green-500", parent: "repeatOrder" },
        { level: 5, key: "fivePlus", label: "5 单+ 用户", count: fivePlus, color: "bg-emerald-500", parent: "threePlus" },
      ],
      rates: {
        firstOrderRate: pct(orderedUsers, totalUsers),
        repeatRate: pct(repeatOrder, orderedUsers),
        threePlusRate: pct(threePlus, orderedUsers),
        fivePlusRate: pct(fivePlus, orderedUsers),
      },
    }
  }
}
