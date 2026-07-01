/**
 * v62 P2-B: GET /api/user/dashboard/summary 测试
 *
 * 4 个数据段:
 * 1. KPI
 * 2. categoryBreakdown(分类饼图)
 * 3. trend(趋势线 - 6 个月)
 * 4. timeline(时间线 - 本月所有收益)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/utils/auth', () => ({
  verifyToken: vi.fn(),
}))

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    reward: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    dividend: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    order: {
      count: vi.fn(),
    },
  },
}))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { verifyToken } from '@/lib/utils/auth'
import { prisma } from '@/lib/prisma'

describe('GET /api/user/dashboard/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 默认 user.findUnique 返回 user(用 Promise.all 调 2 次)
    prisma.user.findUnique.mockResolvedValue({
      earningsAvailable: 500,
      earningsPending: 100,
      earningsVoided: 50,
      balance: 800,
      frozenBalance: 0,
      unlockedPoints: 1000,
      lockedPoints: 500,
      pointsPerBox: 500,
    } as any)
  })

  // ===== 鉴权 =====
  it('returns 401 when not logged in', async () => {
    verifyToken.mockResolvedValueOnce(null)
    const { GET } = await import('@/app/api/user/dashboard/route')
    const req = new Request('http://localhost/api/user/dashboard')
    const res = await GET(req as any)
    expect(res.status).toBe(401)
  })

  // ===== Happy path - KPI =====
  it('aggregates KPI: monthEarnings + pendingLockedAmount + availableAmount', async () => {
    verifyToken.mockResolvedValueOnce({ userId: 'u-1' })

    // 第 1 次 fetchMany(rewards - month)
    prisma.reward.findMany.mockResolvedValueOnce([
      { amount: 100, type: 'referral' },
      { amount: 50, type: 'brand_bonus' },
    ] as any)
    // 第 2 次 fetchMany(dividends - month)
    prisma.dividend.findMany.mockResolvedValueOnce([{ amount: 30 }] as any)
    // prisma.order.count
    prisma.order.count.mockResolvedValueOnce(3 as any)
    // 第 4/5 次 user.findUnique 已默认 mock

    // 第 6/7 次 fetchMany(rewards past 6 months + dividends past 6 months)
    prisma.reward.findMany.mockResolvedValueOnce([] as any)
    prisma.dividend.findMany.mockResolvedValueOnce([] as any)

    // 第 8/9 次 fetchMany(timeline - 50 rewards + 50 dividends)
    prisma.reward.findMany.mockResolvedValueOnce([] as any)
    prisma.dividend.findMany.mockResolvedValueOnce([] as any)

    const { GET } = await import('@/app/api/user/dashboard/route')
    const res = await GET(new Request('http://localhost/api/user/dashboard') as any)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.kpi.monthEarnings).toBe(180)  // 100+50+30
    expect(data.data.kpi.monthOrders).toBe(3)
    expect(data.data.kpi.availableAmount).toBe(500)
    expect(data.data.kpi.pendingAmount).toBe(100)
    // pendingLockedAmount = 500 lockedPoints * 0.2 = 100
    expect(data.data.kpi.pendingLockedAmount).toBe(100)
  })

  // ===== Happy path - 分类饼图 =====
  it('categorizes month rewards + dividend by type with color/label', async () => {
    verifyToken.mockResolvedValueOnce({ userId: 'u-1' })

    prisma.reward.findMany.mockResolvedValueOnce([
      { amount: 90, type: 'referral' },
      { amount: 60, type: 'brand_bonus' },
      { amount: 30, type: 'manual_reward' },
    ] as any)
    prisma.dividend.findMany.mockResolvedValueOnce([{ amount: 20 }] as any)
    prisma.order.count.mockResolvedValueOnce(2 as any)
    // past 6 months
    prisma.reward.findMany.mockResolvedValueOnce([] as any)
    prisma.dividend.findMany.mockResolvedValueOnce([] as any)
    // timeline
    prisma.reward.findMany.mockResolvedValueOnce([] as any)
    prisma.dividend.findMany.mockResolvedValueOnce([] as any)

    const { GET } = await import('@/app/api/user/dashboard/route')
    const res = await GET(new Request('http://localhost/api/user/dashboard') as any)
    const data = await res.json()

    expect(data.data.categoryBreakdown).toHaveLength(4)
    // 按 amount 降序
    expect(data.data.categoryBreakdown[0]).toMatchObject({ type: 'referral', label: '推荐奖', amount: 90 })
    expect(data.data.categoryBreakdown[1]).toMatchObject({ type: 'brand_bonus', label: '品牌管理奖', amount: 60 })
    expect(data.data.categoryBreakdown[2]).toMatchObject({ type: 'manual_reward', label: '手动奖励', amount: 30 })
    expect(data.data.categoryBreakdown[3]).toMatchObject({ type: 'dividend', label: '每日分红', amount: 20 })
    // 颜色映射
    expect(data.data.categoryBreakdown[0].color).toBe('#3b82f6')
    expect(data.data.categoryBreakdown[3].color).toBe('#ef4444')
  })

  // ===== Trend - 6 个月数据 =====
  it('trend has 6 months with 0 for empty months', async () => {
    verifyToken.mockResolvedValueOnce({ userId: 'u-1' })

    prisma.reward.findMany.mockResolvedValueOnce([] as any)
    prisma.dividend.findMany.mockResolvedValueOnce([] as any)
    prisma.order.count.mockResolvedValueOnce(0 as any)
    // past 6 months - 提供 2 月份数据
    prisma.reward.findMany.mockResolvedValueOnce([
      { amount: 200, createdAt: new Date('2026-02-15') },
      { amount: 100, createdAt: new Date('2026-05-20') },
    ] as any)
    prisma.dividend.findMany.mockResolvedValueOnce([] as any)
    // timeline
    prisma.reward.findMany.mockResolvedValueOnce([] as any)
    prisma.dividend.findMany.mockResolvedValueOnce([] as any)

    const { GET } = await import('@/app/api/user/dashboard/route')
    const res = await GET(new Request('http://localhost/api/user/dashboard') as any)
    const data = await res.json()

    expect(data.data.trend).toHaveLength(6)
    // 第一个月/最后一个月必然 0(2 月前空)
    const feb = data.data.trend.find((t: any) => t.month === '2026-02')
    expect(feb.amount).toBe(200)
    const may = data.data.trend.find((t: any) => t.month === '2026-05')
    expect(may.amount).toBe(100)
  })

  // ===== Timeline =====
  it('timeline sorts by date desc, merges rewards + dividends', async () => {
    verifyToken.mockResolvedValueOnce({ userId: 'u-1' })

    // 当前月
    prisma.reward.findMany.mockResolvedValueOnce([] as any)
    prisma.dividend.findMany.mockResolvedValueOnce([] as any)
    prisma.order.count.mockResolvedValueOnce(0 as any)
    // past 6 months
    prisma.reward.findMany.mockResolvedValueOnce([] as any)
    prisma.dividend.findMany.mockResolvedValueOnce([] as any)

    // timeline - mix of rewards + dividends
    prisma.reward.findMany.mockResolvedValueOnce([
      { id: 'r1', type: 'referral', amount: 50, createdAt: new Date('2026-06-10T08:00:00Z'), order: { orderNo: 'ORD-1' } },
      { id: 'r2', type: 'brand_bonus', amount: 100, createdAt: new Date('2026-06-05T08:00:00Z'), order: { orderNo: null } },
    ] as any)
    prisma.dividend.findMany.mockResolvedValueOnce([
      { id: 'd1', amount: 30, dividendDate: new Date('2026-06-08T08:00:00Z'), order: { orderNo: 'ORD-2' } },
    ] as any)

    const { GET } = await import('@/app/api/user/dashboard/route')
    const res = await GET(new Request('http://localhost/api/user/dashboard') as any)
    const data = await res.json()

    expect(data.data.timeline).toHaveLength(3)
    // 按 date 降序
    expect(data.data.timeline[0].label).toBe('直推奖励')  // 6/10
    expect(data.data.timeline[1].label).toBe('每日分红')  // 6/8
    expect(data.data.timeline[2].label).toBe('品牌管理奖') // 6/5
    // 关联 orderNo
    expect(data.data.timeline[0].orderNo).toBe('ORD-1')
  })

  // ===== Empty state =====
  it('returns empty arrays for users with no history (new user)', async () => {
    verifyToken.mockResolvedValueOnce({ userId: 'u-new' })

    prisma.reward.findMany.mockResolvedValue([] as any)
    prisma.dividend.findMany.mockResolvedValue([] as any)
    prisma.order.count.mockResolvedValue(0 as any)

    const { GET } = await import('@/app/api/user/dashboard/route')
    const res = await GET(new Request('http://localhost/api/user/dashboard') as any)
    const data = await res.json()

    expect(data.success).toBe(true)
    expect(data.data.kpi.monthEarnings).toBe(0)
    expect(data.data.kpi.monthOrders).toBe(0)
    expect(data.data.categoryBreakdown).toEqual([])
    expect(data.data.trend).toHaveLength(6)
    expect(data.data.timeline).toEqual([])
  })

  // ===== Error handling =====
  it('returns 500 on DB error', async () => {
    verifyToken.mockResolvedValueOnce({ userId: 'u-1' })
    prisma.reward.findMany.mockRejectedValueOnce(new Error('DB down'))

    const { GET } = await import('@/app/api/user/dashboard/route')
    const res = await GET(new Request('http://localhost/api/user/dashboard') as any)

    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.success).toBe(false)
  })
})
