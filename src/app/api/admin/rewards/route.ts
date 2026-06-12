import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'

// GET /api/admin/rewards — 获取奖励流水列表（管理员）
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['finance_admin', 'super_admin'])
    if (authError || !admin) return authError!

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20')))
    const type = searchParams.get('type')?.trim() || ''
    const search = searchParams.get('search')?.trim() || ''
    const startDate = searchParams.get('startDate')?.trim() || ''
    const endDate = searchParams.get('endDate')?.trim() || ''

    // 构建用户搜索条件
    const userSearchFilter = search ? {
      user: {
        OR: [
          { phone: { contains: search } },
          { nickname: { contains: search } },
        ],
      },
    } : {}

    // 构建日期条件
    const dateFilter = (startDate || endDate) ? (() => {
      const createdAt: Record<string, Date> = {}
      if (startDate) createdAt.gte = new Date(startDate)
      if (endDate) createdAt.lte = new Date(new Date(endDate).setHours(23, 59, 59, 999))
      return { createdAt }
    })() : {}

    // 构建 Reward 查询条件
    const rewardWhere: Record<string, unknown> = { ...userSearchFilter, ...dateFilter }
    if (type && type !== 'dividend') {
      rewardWhere.type = type
    } else if (!type) {
      // 查全部时排除 dividend 类型（dividend 从 Dividend 表查）
      rewardWhere.type = { not: 'dividend' }
    }

    // 构建 Dividend 查询条件
    const dividendWhere: Record<string, unknown> = { ...userSearchFilter, ...dateFilter }

    // 并行查询
    const queries: Promise<unknown>[] = []

    // 查 Reward（非 dividend 类型）
    if (!type || (type !== 'dividend')) {
      queries.push(
        prisma.reward.findMany({
          where: rewardWhere,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            user: { select: { id: true, phone: true, nickname: true, level: true } },
            order: { select: { id: true, orderNo: true } },
          },
        }),
        prisma.reward.count({ where: rewardWhere }),
      )
    } else {
      queries.push(Promise.resolve([]), Promise.resolve(0))
    }

    // 查 Dividend（仅 dividend 类型或全部）
    if (!type || type === 'dividend') {
      queries.push(
        prisma.dividend.findMany({
          where: dividendWhere,
          orderBy: { createdAt: 'desc' },
          skip: type === 'dividend' ? (page - 1) * pageSize : 0,
          take: type === 'dividend' ? pageSize : 1000,
          include: {
            user: { select: { id: true, phone: true, nickname: true, level: true } },
            order: { select: { id: true, orderNo: true } },
          },
        }),
        prisma.dividend.count({ where: dividendWhere }),
      )
    } else {
      queries.push(Promise.resolve([]), Promise.resolve(0))
    }

    // 查汇总统计
    const statsCondition = { ...userSearchFilter, ...dateFilter }
    const statsConditionForDividend = { ...userSearchFilter, ...dateFilter }
    queries.push(
      // 各类型奖励总额
      prisma.reward.groupBy({
        by: ['type'],
        where: { ...statsCondition, status: 'paid' },
        _sum: { amount: true },
        _count: true,
      }),
      // 分红总额
      prisma.dividend.aggregate({
        where: statsConditionForDividend,
        _sum: { amount: true },
        _count: true,
      }),
    )

    const results = await Promise.all(queries)
    const rewards = results[0] as Array<{
      id: string; userId: string; type: string; amount: number;
      orderId: string; fromUserId: string | null; level: number | null;
      status: string; createdAt: Date;
      user: { id: string; phone: string; nickname: string | null; level: number };
      order: { id: string; orderNo: string } | null;
    }>
    const rewardTotal = results[1] as number
    const dividends = results[2] as Array<{
      id: string; userId: string; amount: number; userLevel: number;
      totalPool: number; dividendDate: Date; orderId: string; createdAt: Date;
      user: { id: string; phone: string; nickname: string | null; level: number };
      order: { id: string; orderNo: string } | null;
    }>
    const dividendTotal = results[3] as number
    const rewardStats = results[4] as Array<{
      type: string; _sum: { amount: number | null }; _count: number;
    }>
    const dividendStats = results[5] as {
      _sum: { amount: number | null }; _count: number;
    }

    // 格式化分红记录
    const formattedDividends = dividends.map(d => ({
      id: d.id,
      userId: d.userId,
      user: d.user,
      type: 'dividend' as const,
      amount: d.amount,
      orderId: d.orderId,
      orderNo: d.order?.orderNo || null,
      fromUserId: null,
      level: null,
      status: 'paid' as const,
      createdAt: d.createdAt,
    }))

    // 如果只查分红
    if (type === 'dividend') {
      const stats = buildStats(rewardStats, dividendStats)
      return NextResponse.json({
        success: true,
        data: formattedDividends,
        message: '获取奖励流水成功',
        pagination: { page, pageSize, total: dividendTotal, totalPages: Math.ceil(dividendTotal / pageSize) },
        stats,
      })
    }

    // 如果只查非分红类型
    if (type) {
      const formattedRewards = rewards.map(r => ({
        id: r.id, userId: r.userId, user: r.user, type: r.type,
        amount: r.amount, orderId: r.orderId, orderNo: r.order?.orderNo || null,
        fromUserId: r.fromUserId, level: r.level, status: r.status, createdAt: r.createdAt,
      }))
      const stats = buildStats(rewardStats, dividendStats)
      return NextResponse.json({
        success: true,
        data: formattedRewards,
        message: '获取奖励流水成功',
        pagination: { page, pageSize, total: rewardTotal, totalPages: Math.ceil(rewardTotal / pageSize) },
        stats,
      })
    }

    // 合并全部
    const allRewards = [
      ...rewards.map(r => ({
        id: r.id, userId: r.userId, user: r.user, type: r.type,
        amount: r.amount, orderId: r.orderId, orderNo: r.order?.orderNo || null,
        fromUserId: r.fromUserId, level: r.level, status: r.status, createdAt: r.createdAt,
      })),
      ...formattedDividends,
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const totalCount = rewardTotal + dividendTotal
    const stats = buildStats(rewardStats, dividendStats)

    return NextResponse.json({
      success: true,
      data: allRewards,
      message: '获取奖励流水成功',
      pagination: { page, pageSize, total: totalCount, totalPages: Math.ceil(totalCount / pageSize) },
      stats,
    })
  } catch (error) {
    console.error('Admin get rewards error:', error)
    return NextResponse.json(
      { success: false, message: '获取奖励流水失败' },
      { status: 500 }
    )
  }
}

// 构建汇总统计
function buildStats(
  rewardStats: Array<{ type: string; _sum: { amount: number | null }; _count: number }>,
  dividendStats: { _sum: { amount: number | null }; _count: number },
) {
  const stats: Record<string, { total: number; count: number }> = {
    referral: { total: 0, count: 0 },
    team: { total: 0, count: 0 },
    brand_bonus: { total: 0, count: 0 },
    dividend: { total: 0, count: 0 },
  }

  for (const stat of rewardStats) {
    if (stat.type in stats) {
      stats[stat.type] = {
        total: stat._sum.amount || 0,
        count: stat._count,
      }
    }
  }

  stats.dividend = {
    total: dividendStats._sum.amount || 0,
    count: dividendStats._count,
  }

  const grandTotal = Object.values(stats).reduce((sum, s) => sum + s.total, 0)
  const grandCount = Object.values(stats).reduce((sum, s) => sum + s.count, 0)

  return { ...stats, grandTotal, grandCount }
}