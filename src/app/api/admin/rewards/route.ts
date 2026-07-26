import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { RewardService } from '@/lib/services/reward.service'
import { logger } from '@/lib/logger'

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

    const { rewards, rewardTotal, dividends, dividendTotal, rewardStats, dividendStats } =
      await RewardService.getRewardsList({ page, pageSize, type: type || undefined, search: search || undefined, startDate: startDate || undefined, endDate: endDate || undefined })

    const typedRewards = rewards as Array<{
      id: string; userId: string; type: string; amount: number;
      orderId: string; fromUserId: string | null; level: number | null;
      status: string; createdAt: Date;
      user: { id: string; phone: string; nickname: string | null; level: number };
      order: { id: string; orderNo: string } | null;
    }>
    const rTotal = rewardTotal as number
    const typedDividends = dividends as Array<{
      id: string; userId: string; amount: number; userLevel: number;
      totalPool: number; dividendDate: Date; orderId: string; createdAt: Date;
      user: { id: string; phone: string; nickname: string | null; level: number };
      order: { id: string; orderNo: string } | null;
    }>
    const dTotal = dividendTotal as number
    const rStats = rewardStats as Array<{
      type: string; _sum: { amount: number | null }; _count: number;
    }>
    const dStats = dividendStats as {
      _sum: { amount: number | null }; _count: number;
    }

    const formattedDividends = typedDividends.map(d => ({
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

    if (type === 'dividend') {
      const stats = buildStats(rStats, dStats)
      return NextResponse.json({
        success: true,
        data: formattedDividends,
        message: '\u83b7\u53d6\u5956\u52b1\u6d41\u6c34\u6210\u529f',
        pagination: { page, pageSize, total: dTotal, totalPages: Math.ceil(dTotal / pageSize) },
        stats,
      })
    }

    if (type) {
      const formattedRewards = typedRewards.map(r => ({
        id: r.id, userId: r.userId, user: r.user, type: r.type,
        amount: r.amount, orderId: r.orderId, orderNo: r.order?.orderNo || null,
        fromUserId: r.fromUserId, level: r.level, status: r.status, createdAt: r.createdAt,
      }))
      const stats = buildStats(rStats, dStats)
      return NextResponse.json({
        success: true,
        data: formattedRewards,
        message: '\u83b7\u53d6\u5956\u52b1\u6d41\u6c34\u6210\u529f',
        pagination: { page, pageSize, total: rTotal, totalPages: Math.ceil(rTotal / pageSize) },
        stats,
      })
    }

    const allRewards = [
      ...typedRewards.map(r => ({
        id: r.id, userId: r.userId, user: r.user, type: r.type,
        amount: r.amount, orderId: r.orderId, orderNo: r.order?.orderNo || null,
        fromUserId: r.fromUserId, level: r.level, status: r.status, createdAt: r.createdAt,
      })),
      ...formattedDividends,
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const totalCount = rTotal + dTotal
    const stats = buildStats(rStats, dStats)

    return NextResponse.json({
      success: true,
      data: allRewards,
      message: '\u83b7\u53d6\u5956\u52b1\u6d41\u6c34\u6210\u529f',
      pagination: { page, pageSize, total: totalCount, totalPages: Math.ceil(totalCount / pageSize) },
      stats,
    })
  } catch (error) {
    logger.error('Admin get rewards error:', error)
    return NextResponse.json(
      { success: false, message: '\u83b7\u53d6\u5956\u52b1\u6d41\u6c34\u5931\u8d25' },
      { status: 500 }
    )
  }
}

function buildStats(
  rewardStats: Array<{ type: string; _sum: { amount: number | null }; _count: number }>,
  dividendStats: { _sum: { amount: number | null }; _count: number },
) {
  const stats: Record<string, { total: number; count: number }> = {
    referral: { total: 0, count: 0 },
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
