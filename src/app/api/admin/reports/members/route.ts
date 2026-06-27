import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'

// GET /api/admin/reports/members — 会员报表（v51.1）
// 返回: { levelDistribution, referrerRate, activity }
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin', 'support_admin', 'auditor'])
    if (authError || !admin) return authError!

    const now = new Date()
    const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
    const thirtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)

    // ---- 等级分布（1=会员 2=经销商 3=主任 4=经理 5=总监 6=总裁 7=董事）----
    const levelGroups = await prisma.user.groupBy({
      by: ['level'],
      where: { status: { not: 'deleted' } },
      _count: { _all: true },
    })

    const LEVEL_LABELS: Record<number, string> = {
      1: '会员', 2: '经销商', 3: '主任', 4: '经理', 5: '总监', 6: '总裁', 7: '董事',
    }
    const levelDistribution = levelGroups
      .map(g => ({ level: g.level, label: LEVEL_LABELS[g.level] || `L${g.level}`, count: g._count._all }))
      .sort((a, b) => a.level - b.level)

    // ---- 推荐转化率 ----
    const [totalUsers, withReferrer] = await Promise.all([
      prisma.user.count({ where: { status: { not: 'deleted' } } }),
      prisma.user.count({ where: { status: { not: 'deleted' }, referrerId: { not: null } } }),
    ])
    const referrerRate = totalUsers > 0 ? Math.round((withReferrer / totalUsers) * 100 * 10) / 10 : 0

    // ---- 活跃度（7d / 30d 下单用户数）----
    const [active7d, active30d, totalOrderUsers] = await Promise.all([
      prisma.order.findMany({
        where: { createdAt: { gte: sevenDaysAgo }, status: { in: ['paid', 'shipped', 'completed'] } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      prisma.order.findMany({
        where: { createdAt: { gte: thirtyDaysAgo }, status: { in: ['paid', 'shipped', 'completed'] } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      prisma.order.findMany({
        where: { status: { in: ['paid', 'shipped', 'completed'] } },
        select: { userId: true },
        distinct: ['userId'],
      }),
    ])

    const activity = {
      active7d: active7d.length,
      active30d: active30d.length,
      totalOrderUsers: totalOrderUsers.length,
      active7dRate: totalUsers > 0 ? Math.round((active7d.length / totalUsers) * 100 * 10) / 10 : 0,
      active30dRate: totalUsers > 0 ? Math.round((active30d.length / totalUsers) * 100 * 10) / 10 : 0,
      purchaseRate: totalUsers > 0 ? Math.round((totalOrderUsers.length / totalUsers) * 100 * 10) / 10 : 0,
    }

    return NextResponse.json({
      success: true,
      data: {
        levelDistribution,
        referrerRate: { withReferrer, total: totalUsers, rate: referrerRate },
        activity,
      },
    })
  } catch (error) {
    console.error('[Members Report Error]', error)
    return NextResponse.json(
      { success: false, message: '服务器错误' },
      { status: 500 }
    )
  }
}
