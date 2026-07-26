import { prisma } from "@/lib/prisma"

// ---- Types ----

export type FinanceExportRow = Record<"metric" | "amount", string>

export type LevelExportRow = { level: string; label: string; count: number }
export type ReferrerExportRow = { totalUsers: number; withReferrer: number; conversionRate: string }
export type ActivityExportRow = { metric: string; count: number; ratio: string }

export type MembersExportData = {
  levelRows: LevelExportRow[]
  referrerRow: ReferrerExportRow
  activityRows: ActivityExportRow[]
}

export type ProductExportRow = { name: string; sales: string; quantity: number; orderCount: number }
export type MemberExportRow = { nickname: string; phone: string; level: string; sales: string; orderCount: number }

export type SalesExportData = {
  topProducts: ProductExportRow[]
  topMembers: MemberExportRow[]
}

// ---- Helpers ----

const VALID_STATUSES = ["paid", "shipped", "completed"]
const LEVEL_LABELS: Record<number, string> = { 1: "会员", 2: "经销商", 3: "主任", 4: "经理", 5: "总监", 6: "总裁", 7: "董事" }

function pctStr(a: number, b: number): string {
  return b > 0 ? (Math.round((a / b) * 1000) / 10).toFixed(1) + "%" : "0%"
}

// ---- Service ----

export class ExportService {
  /**
   * D-5.8: 财务数据 CSV 导出
   * Migrated from src/app/api/admin/reports/export/finance/route.ts
   */
  static async getFinanceExport(days: number): Promise<FinanceExportRow[]> {
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

    return [
      { metric: "总收入（销售订单 payAmount）", amount: income.toFixed(2) },
      { metric: "退款支出", amount: refundTotal.toFixed(2) },
      { metric: "提现支出", amount: withdrawalTotal.toFixed(2) },
      { metric: "总支出", amount: expense.toFixed(2) },
      { metric: "净收入", amount: (income - expense).toFixed(2) },
    ]
  }

  /**
   * D-5.8: 会员数据 CSV 导出
   * Migrated from src/app/api/admin/reports/export/members/route.ts
   */
  static async getMembersExport(): Promise<MembersExportData> {
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

    const levelRows = levelGroups
      .map(g => ({ level: `L${g.level}`, label: LEVEL_LABELS[g.level] || `L${g.level}`, count: g._count._all }))
      .sort((a, b) => parseInt(a.level.slice(1)) - parseInt(b.level.slice(1)))

    const referrerRow: ReferrerExportRow = {
      totalUsers, withReferrer,
      conversionRate: pctStr(withReferrer, totalUsers),
    }

    const activityRows: ActivityExportRow[] = [
      { metric: "7日活跃", count: active7d.length, ratio: pctStr(active7d.length, totalUsers) },
      { metric: "30日活跃", count: active30d.length, ratio: pctStr(active30d.length, totalUsers) },
      { metric: "总下单会员", count: totalOrderUsers.length, ratio: pctStr(totalOrderUsers.length, totalUsers) },
    ]

    return { levelRows, referrerRow, activityRows }
  }

  /**
   * D-5.8: 销售数据 CSV 导出
   * Migrated from src/app/api/admin/reports/export/sales/route.ts
   */
  static async getSalesExport(days: number): Promise<SalesExportData> {
    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1)

    const [orderItems, orders] = await Promise.all([
      prisma.orderItem.findMany({
        where: { order: { status: { in: VALID_STATUSES }, createdAt: { gte: startDate } } },
        select: { productId: true, quantity: true, totalPrice: true, product: { select: { name: true } } },
      }),
      prisma.order.findMany({
        where: { status: { in: VALID_STATUSES }, createdAt: { gte: startDate } },
        select: { userId: true, payAmount: true, user: { select: { phone: true, nickname: true, level: true } } },
      }),
    ])

    const productMap = new Map<string, { name: string; sales: number; quantity: number; orderCount: number }>()
    for (const item of orderItems) {
      const ex = productMap.get(item.productId)
      if (ex) { ex.sales += item.totalPrice; ex.quantity += item.quantity; ex.orderCount += 1 }
      else { productMap.set(item.productId, { name: item.product.name, sales: item.totalPrice, quantity: item.quantity, orderCount: 1 }) }
    }
    const topProducts: ProductExportRow[] = Array.from(productMap.values())
      .sort((a, b) => b.sales - a.sales)
      .map(p => ({ name: p.name, sales: (Math.round(p.sales * 100) / 100).toFixed(2), quantity: p.quantity, orderCount: p.orderCount }))

    const memberMap = new Map<string, { nickname: string | null; phone: string; level: number; sales: number; orderCount: number }>()
    for (const o of orders) {
      const ex = memberMap.get(o.userId)
      if (ex) { ex.sales += o.payAmount; ex.orderCount += 1 }
      else { memberMap.set(o.userId, { nickname: o.user.nickname, phone: o.user.phone, level: o.user.level, sales: o.payAmount, orderCount: 1 }) }
    }
    const topMembers: MemberExportRow[] = Array.from(memberMap.values())
      .sort((a, b) => b.sales - a.sales)
      .map(m => ({ nickname: m.nickname || "", phone: m.phone, level: `L${m.level}`, sales: (Math.round(m.sales * 100) / 100).toFixed(2), orderCount: m.orderCount }))

    return { topProducts, topMembers }
  }
}
