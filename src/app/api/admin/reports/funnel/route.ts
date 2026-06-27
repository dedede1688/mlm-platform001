import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'

// GET /api/admin/reports/funnel — 转化漏斗（v51.3）
// 5 级漏斗：总注册 → 下过单 → 复购 → 3 单+ → 5 单+
// 返回: { totalUsers, orderedUsers, firstOrder, repeatOrder, threePlus, fivePlus, rates }
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin', 'support_admin', 'finance_admin', 'auditor'])
    if (authError || !admin) return authError!

    const validStatuses = ['paid', 'shipped', 'completed']

    // ---- 1. 总注册用户（非 deleted）----
    const totalUsers = await prisma.user.count({
      where: { status: { not: 'deleted' } },
    })

    // ---- 2. 按 userId groupBy 订单数 ----
    const orderCounts = await prisma.order.groupBy({
      by: ['userId'],
      where: { status: { in: validStatuses } },
      _count: { _all: true },
    })

    const orderedUsers = orderCounts.length
    let repeatOrder = 0  // ≥2 单
    let threePlus = 0    // ≥3 单
    let fivePlus = 0     // ≥5 单

    for (const o of orderCounts) {
      const c = o._count._all
      if (c >= 2) repeatOrder++
      if (c >= 3) threePlus++
      if (c >= 5) fivePlus++
    }

    // ---- 3. 转化率 ----
    const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100 * 10) / 10 : 0

    return NextResponse.json({
      success: true,
      data: {
        funnel: [
          { level: 1, key: 'totalUsers', label: '注册用户', count: totalUsers, color: 'bg-gray-500', parent: null },
          { level: 2, key: 'orderedUsers', label: '下过单', count: orderedUsers, color: 'bg-blue-500', parent: 'totalUsers' },
          { level: 3, key: 'repeatOrder', label: '复购用户（≥2 单）', count: repeatOrder, color: 'bg-cyan-500', parent: 'orderedUsers' },
          { level: 4, key: 'threePlus', label: '3 单+ 用户', count: threePlus, color: 'bg-green-500', parent: 'repeatOrder' },
          { level: 5, key: 'fivePlus', label: '5 单+ 用户', count: fivePlus, color: 'bg-emerald-500', parent: 'threePlus' },
        ],
        rates: {
          firstOrderRate: pct(orderedUsers, totalUsers),    // 注册→首单
          repeatRate: pct(repeatOrder, orderedUsers),      // 首单→复购
          threePlusRate: pct(threePlus, orderedUsers),     // 首单→3 单+
          fivePlusRate: pct(fivePlus, orderedUsers),       // 首单→5 单+
        },
      },
    })
  } catch (error) {
    console.error('[Funnel Report Error]', error)
    return NextResponse.json(
      { success: false, message: '服务器错误' },
      { status: 500 }
    )
  }
}
