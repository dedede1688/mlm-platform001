import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'

// GET /api/admin/statistics/dashboard — 仪表盘核心指标
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin', 'goods_admin', 'finance_admin', 'support_admin', 'auditor'])
    if (authError || !admin) return authError!

    const now = new Date()

    // 今日起止时间
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

    // 本月起止时间
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    // 有效订单状态（paid, shipped, completed）
    const validStatuses = ['paid', 'shipped', 'completed']

    // --- 今日统计 ---
    const todayOrders = await prisma.order.findMany({
      where: {
        status: { in: validStatuses },
        createdAt: { gte: todayStart, lt: todayEnd },
      },
      select: { payAmount: true },
    })
    const todaySales = todayOrders.reduce((sum: number, o: { payAmount: number }) => sum + o.payAmount, 0)
    const todayOrderCount = todayOrders.length

    const todayNewUsers = await prisma.user.count({
      where: {
        createdAt: { gte: todayStart, lt: todayEnd },
        status: { not: 'deleted' },
      },
    })

    // --- 本月统计 ---
    const monthOrders = await prisma.order.findMany({
      where: {
        status: { in: validStatuses },
        createdAt: { gte: monthStart, lt: monthEnd },
      },
      select: { payAmount: true },
    })
    const monthSales = monthOrders.reduce((sum: number, o: { payAmount: number }) => sum + o.payAmount, 0)
    const monthOrderCount = monthOrders.length

    const monthNewUsers = await prisma.user.count({
      where: {
        createdAt: { gte: monthStart, lt: monthEnd },
        status: { not: 'deleted' },
      },
    })

    // --- 总计统计 ---
    const totalOrders = await prisma.order.findMany({
      where: { status: { in: validStatuses } },
      select: { payAmount: true },
    })
    const totalSales = totalOrders.reduce((sum: number, o: { payAmount: number }) => sum + o.payAmount, 0)
    const totalOrderCount = totalOrders.length

    const totalUsers = await prisma.user.count({
      where: { status: { not: 'deleted' } },
    })

    // --- 待发货订单数 ---
    const pendingShipmentCount = await prisma.order.count({
      where: { status: 'paid' },
    })

    // --- 待审核提现数 ---
    const pendingWithdrawalCount = await prisma.withdrawal.count({
      where: { status: 'pending' },
    })

    // 金额保留两位小数
    const round2 = (n: number) => Math.round(n * 100) / 100

    return NextResponse.json({
      success: true,
      data: {
        today: {
          sales: round2(todaySales),
          orderCount: todayOrderCount,
          newUsers: todayNewUsers,
        },
        month: {
          sales: round2(monthSales),
          orderCount: monthOrderCount,
          newUsers: monthNewUsers,
        },
        total: {
          sales: round2(totalSales),
          orderCount: totalOrderCount,
          users: totalUsers,
        },
        pendingShipmentCount,
        pendingWithdrawalCount,
      },
    })
  } catch (error) {
    console.error('[Dashboard Statistics Error]', error)
    return NextResponse.json(
      { success: false, message: '服务器错误' },
      { status: 500 }
    )
  }
}