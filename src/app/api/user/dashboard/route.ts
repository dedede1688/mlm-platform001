import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/utils/auth'

// v62 P2-B: 用户端可视化大盘聚合 API
// 4 个数据:
// 1. KPI - 本月收益 / 待解锁 / 已到账 / 订单数
// 2. 分类饼图 - 本月收益来源(referral / brand_bonus / dividend / 其他)
// 3. 趋势线 - 过去 6 个月月度总收益
// 4. 时间线 - 本月每条收益明细
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    }

    const userId = auth.userId
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)

    // ---- 1. KPI ----
    // 本月收益(reward + dividend)
    const [monthRewards, monthDividends, userInfo, monthOrders] = await Promise.all([
      prisma.reward.findMany({
        where: {
          userId,
          status: 'paid',
          createdAt: { gte: monthStart, lt: monthEnd },
        },
        select: { amount: true, type: true },
      }),
      prisma.dividend.findMany({
        where: {
          userId,
          dividendDate: { gte: monthStart, lt: monthEnd },
        },
        select: { amount: true },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          earningsAvailable: true,
          earningsPending: true,
          earningsVoided: true,
          balance: true,
          frozenBalance: true,
          unlockedPoints: true,
          lockedPoints: true,
        },
      }),
      prisma.order.count({
        where: {
          userId,
          createdAt: { gte: monthStart, lt: monthEnd },
        },
      }),
    ])

    const monthRewardTotal = monthRewards.reduce((s, r) => s + r.amount, 0)
    const monthDividendTotal = monthDividends.reduce((s, d) => s + d.amount, 0)
    const monthEarnings = monthRewardTotal + monthDividendTotal

    // pendingLockedAmount = lockedPoints × (估算 ¥/积分)
    // 简单估算:假设 1 积分 ≈ 0.2 元(可调) — 后续可改成 system-parameters
    const pendingLockedAmount = Math.round((userInfo?.lockedPoints ?? 0) * 0.2 * 100) / 100
    const availableAmount = userInfo?.earningsAvailable ?? 0
    const pendingAmount = userInfo?.earningsPending ?? 0

    // ---- 2. 分类饼图 ----
    const typeLabelMap: Record<string, string> = {
      referral: '推荐奖',
      brand_bonus: '品牌管理奖',
      upgrade_reward: '升级奖励',
      manual_reward: '手动奖励',
      refund_reward: '退款冲销', // 不会出现在 paid,这里仅兜底
    }
    const typeColorMap: Record<string, string> = {
      referral: '#3b82f6',
      brand_bonus: '#10b981',
      upgrade_reward: '#a855f7',
      manual_reward: '#f59e0b',
    }

    const categoryMap = new Map<string, number>()
    for (const r of monthRewards) {
      categoryMap.set(r.type, (categoryMap.get(r.type) || 0) + r.amount)
    }
    if (monthDividendTotal > 0) {
      categoryMap.set('dividend', monthDividendTotal)
    }

    const categoryBreakdown = Array.from(categoryMap.entries())
      .filter(([, amt]) => amt > 0)
      .map(([type, amount]) => ({
        type,
        label: type === 'dividend' ? '每日分红' : (typeLabelMap[type] || type),
        amount: Math.round(amount * 100) / 100,
        color: type === 'dividend' ? '#ef4444' : (typeColorMap[type] || '#6b7280'),
      }))
      .sort((a, b) => b.amount - a.amount)

    // ---- 3. 趋势线(过去 6 个月月度总收益:reward + dividend) ----
    const [pastRewards, pastDividends] = await Promise.all([
      prisma.reward.findMany({
        where: {
          userId,
          status: 'paid',
          createdAt: { gte: sixMonthsAgo },
        },
        select: { amount: true, createdAt: true },
      }),
      prisma.dividend.findMany({
        where: {
          userId,
          dividendDate: { gte: sixMonthsAgo },
        },
        select: { amount: true, dividendDate: true },
      }),
    ])

    const trendMap = new Map<string, number>()
    // 初始化 6 个月(0 值)
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      trendMap.set(key, 0)
    }
    for (const r of pastRewards) {
      const k = `${r.createdAt.getFullYear()}-${String(r.createdAt.getMonth() + 1).padStart(2, '0')}`
      trendMap.set(k, (trendMap.get(k) || 0) + r.amount)
    }
    for (const d of pastDividends) {
      const k = `${d.dividendDate.getFullYear()}-${String(d.dividendDate.getMonth() + 1).padStart(2, '0')}`
      trendMap.set(k, (trendMap.get(k) || 0) + d.amount)
    }
    const trend = Array.from(trendMap.entries()).map(([month, amount]) => ({
      month,
      amount: Math.round(amount * 100) / 100,
    }))

    // ---- 4. 时间线(本月每条 reward + dividend 创建记录)----
    // 取最近 50 条 reward + 50 条 dividend,按时间倒序
    const [recentRewards, recentDividends] = await Promise.all([
      prisma.reward.findMany({
        where: {
          userId,
          status: 'paid',
          createdAt: { gte: monthStart, lt: monthEnd },
        },
        select: {
          id: true,
          type: true,
          amount: true,
          createdAt: true,
          order: { select: { orderNo: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.dividend.findMany({
        where: {
          userId,
          dividendDate: { gte: monthStart, lt: monthEnd },
        },
        select: {
          id: true,
          amount: true,
          dividendDate: true,
          order: { select: { orderNo: true } },
        },
        orderBy: { dividendDate: 'desc' },
        take: 50,
      }),
    ])

    const timelineLabelMap: Record<string, string> = {
      referral: '直推奖励',
      brand_bonus: '品牌管理奖',
      upgrade_reward: '升级奖励',
      manual_reward: '手动奖励',
    }

    const timeline = [
      ...recentRewards.map(r => ({
        id: r.id,
        date: r.createdAt.toISOString(),
        amount: Math.round(r.amount * 100) / 100,
        type: r.type,
        label: timelineLabelMap[r.type] || r.type,
        orderNo: r.order?.orderNo ?? null,
      })),
      ...recentDividends.map(d => ({
        id: d.id,
        date: d.dividendDate.toISOString(),
        amount: Math.round(d.amount * 100) / 100,
        type: 'dividend',
        label: '每日分红',
        orderNo: d.order?.orderNo ?? null,
      })),
    ].sort((a, b) => b.date.localeCompare(a.date))

    return NextResponse.json({
      success: true,
      data: {
        kpi: {
          monthEarnings: Math.round(monthEarnings * 100) / 100,
          monthOrders,
          pendingLockedAmount,
          availableAmount: Math.round(availableAmount * 100) / 100,
          pendingAmount: Math.round(pendingAmount * 100) / 100,
        },
        categoryBreakdown,
        trend,
        timeline,
      },
    })
  } catch (err) {
    console.error('[v62 dashboard summary]', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
