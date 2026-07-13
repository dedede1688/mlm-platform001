import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { errorResponse, successResponse } from '@/lib/api-response'

// v67:数据中台 summary API
// 返回:昨日日报(销售/订单/用户/退款/提现 对比上周同日)
//     + 今日异常(待审退款/待审提现/待发货/库存预警列表)
//     + 当前时间戳(供前端 30 秒刷新判断)
// 所有 admin 角色都能读

const LOW_STOCK_THRESHOLD = 10
const PAID_STATUSES = ['paid', 'shipped', 'completed', 'refunded']

// 计算"昨天"的开始和结束时间
function getYesterdayRange() {
  const now = new Date()
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0)
  const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  return { start: yesterdayStart, end: yesterdayEnd }
}

// 计算"上周同日"的范围
function getLastWeekSameDayRange() {
  const now = new Date()
  const lastWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 8, 0, 0, 0, 0)
  const lastWeekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 0, 0, 0, 0)
  return { start: lastWeekStart, end: lastWeekEnd }
}

export async function GET(request: NextRequest) {
  const { user, error } = await verifyPermission(request, [
    'super_admin', 'goods_admin', 'finance_admin', 'support_admin', 'auditor',
  ])
  if (error || !user) return error || errorResponse('未授权', 401)

  try {
    const yest = getYesterdayRange()
    const lastWeekSame = getLastWeekSameDayRange()
    const now = new Date()

    // 并行查询所有需要的数据
    const [
      // 昨日销售 + 订单(已支付状态)
      yestOrderAgg,
      lastWeekOrderAgg,
      yestOrderCount,
      lastWeekOrderCount,
      // 昨日新增用户
      yestUserCount,
      lastWeekUserCount,
      // 昨日退款金额 + 笔数
      yestRefundAgg,
      lastWeekRefundAgg,
      yestRefundCount,
      lastWeekRefundCount,
      // 昨日提现金额 + 笔数
      yestWithdrawalAgg,
      lastWeekWithdrawalAgg,
      yestWithdrawalCount,
      lastWeekWithdrawalCount,
      // 今日异常
      pendingRefundCount,
      pendingWithdrawalCount,
      // 待发货(已支付未发货 且超过 24h)
      pendingShipmentCount,
      // 库存预警
      lowStockProducts,
    ] = await Promise.all([
      prisma.order.aggregate({
        _sum: { payAmount: true }, _count: { id: true },
        where: { status: { in: PAID_STATUSES }, createdAt: { gte: yest.start, lt: yest.end } },
      }),
      prisma.order.aggregate({
        _sum: { payAmount: true }, _count: { id: true },
        where: { status: { in: PAID_STATUSES }, createdAt: { gte: lastWeekSame.start, lt: lastWeekSame.end } },
      }),
      prisma.order.count({ where: { createdAt: { gte: yest.start, lt: yest.end } } }),
      prisma.order.count({ where: { createdAt: { gte: lastWeekSame.start, lt: lastWeekSame.end } } }),
      prisma.user.count({ where: { createdAt: { gte: yest.start, lt: yest.end } } }),
      prisma.user.count({ where: { createdAt: { gte: lastWeekSame.start, lt: lastWeekSame.end } } }),
      prisma.refundRequest.aggregate({
        _sum: { amount: true }, _count: { id: true },
        where: { status: 'pending', createdAt: { gte: yest.start, lt: yest.end } },
      }),
      prisma.refundRequest.aggregate({
        _sum: { amount: true }, _count: { id: true },
        where: { status: 'pending', createdAt: { gte: lastWeekSame.start, lt: lastWeekSame.end } },
      }),
      prisma.refundRequest.count({ where: { createdAt: { gte: yest.start, lt: yest.end } } }),
      prisma.refundRequest.count({ where: { createdAt: { gte: lastWeekSame.start, lt: lastWeekSame.end } } }),
      prisma.withdrawal.aggregate({
        _sum: { amount: true }, _count: { id: true },
        where: { status: 'pending', createdAt: { gte: yest.start, lt: yest.end } },
      }),
      prisma.withdrawal.aggregate({
        _sum: { amount: true }, _count: { id: true },
        where: { status: 'pending', createdAt: { gte: lastWeekSame.start, lt: lastWeekSame.end } },
      }),
      prisma.withdrawal.count({ where: { createdAt: { gte: yest.start, lt: yest.end } } }),
      prisma.withdrawal.count({ where: { createdAt: { gte: lastWeekSame.start, lt: lastWeekSame.end } } }),
      prisma.refundRequest.count({ where: { status: 'pending' } }),
      prisma.withdrawal.count({ where: { status: 'pending' } }),
      // 待发货:已支付 超过 24 小时还没发货的订单
      prisma.order.count({
        where: {
          status: 'paid',
          paidAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
          shippedAt: null,
        },
      }),
      prisma.product.findMany({
        where: { stock: { lte: LOW_STOCK_THRESHOLD } },
        select: { id: true, name: true, stock: true, sortOrder: true },
        orderBy: { stock: 'asc' },
        take: 20,  // 最多显示 20 个
      }),
    ])

    // 计算同比%(上周同日 = 100% 基线)
    const pct = (current: number, baseline: number): number => {
      if (baseline === 0) return current > 0 ? 100 : 0
      return Math.round(((current - baseline) / baseline) * 100)
    }

    const yesterdayReport = {
      date: yest.start.toISOString().slice(0, 10),
      orders: {
        count: yestOrderCount,
        lastWeekCount: lastWeekOrderCount,
        vsLastWeek: pct(yestOrderCount, lastWeekOrderCount),
      },
      sales: {
        amount: yestOrderAgg._sum.payAmount || 0,
        lastWeekAmount: lastWeekOrderAgg._sum.payAmount || 0,
        vsLastWeek: pct(yestOrderAgg._sum.payAmount || 0, lastWeekOrderAgg._sum.payAmount || 0),
      },
      newUsers: {
        count: yestUserCount,
        lastWeekCount: lastWeekUserCount,
        vsLastWeek: pct(yestUserCount, lastWeekUserCount),
      },
      refunds: {
        count: yestRefundCount,
        amount: yestRefundAgg._sum.amount || 0,
        lastWeekCount: lastWeekRefundCount,
        lastWeekAmount: lastWeekRefundAgg._sum.amount || 0,
        vsLastWeek: pct(yestRefundCount, lastWeekRefundCount),
      },
      withdrawals: {
        count: yestWithdrawalCount,
        amount: yestWithdrawalAgg._sum.amount || 0,
        lastWeekCount: lastWeekWithdrawalCount,
        lastWeekAmount: lastWeekWithdrawalAgg._sum.amount || 0,
        vsLastWeek: pct(yestWithdrawalCount, lastWeekWithdrawalCount),
      },
    }

    const pending = {
      refund: pendingRefundCount,
      withdrawal: pendingWithdrawalCount,
      shipment: pendingShipmentCount,
      lowStock: lowStockProducts.length,
      total: pendingRefundCount + pendingWithdrawalCount + pendingShipmentCount + lowStockProducts.length,
    }

    return successResponse({
      yesterdayReport,
      pending,
      lowStockProducts,
      timestamp: now.toISOString(),
    })
  } catch (err: any) {
    console.error('[Dashboard Summary] 错误:', err)
    return errorResponse(err.message || '获取数据失败', 500)
  }
}
