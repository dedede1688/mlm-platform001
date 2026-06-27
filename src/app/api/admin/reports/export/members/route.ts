import { NextRequest } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'
import { toCsv, csvResponse } from '@/lib/utils/csv-export'

// GET /api/admin/reports/export/members — 会员数据 CSV 导出（v51.2）
// 输出等级分布 + 推荐转化 + 活跃度 3 段
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin', 'support_admin', 'auditor'])
    if (authError || !admin) return authError!

    const now = new Date()
    const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
    const thirtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)

    const validStatuses = ['paid', 'shipped', 'completed']

    // 等级分布
    const levelGroups = await prisma.user.groupBy({
      by: ['level'],
      where: { status: { not: 'deleted' } },
      _count: { _all: true },
    })
    const LEVEL_LABELS: Record<number, string> = { 1: '会员', 2: '经销商', 3: '主任', 4: '经理', 5: '总监', 6: '总裁', 7: '董事' }
    const levelRows = levelGroups
      .map(g => ({ level: `L${g.level}`, label: LEVEL_LABELS[g.level] || `L${g.level}`, count: g._count._all }))
      .sort((a, b) => parseInt(a.level.slice(1)) - parseInt(b.level.slice(1)))

    // 活跃度
    const [totalUsers, withReferrer, active7d, active30d, totalOrderUsers] = await Promise.all([
      prisma.user.count({ where: { status: { not: 'deleted' } } }),
      prisma.user.count({ where: { status: { not: 'deleted' }, referrerId: { not: null } } }),
      prisma.order.findMany({ where: { createdAt: { gte: sevenDaysAgo }, status: { in: validStatuses } }, select: { userId: true }, distinct: ['userId'] }),
      prisma.order.findMany({ where: { createdAt: { gte: thirtyDaysAgo }, status: { in: validStatuses } }, select: { userId: true }, distinct: ['userId'] }),
      prisma.order.findMany({ where: { status: { in: validStatuses } }, select: { userId: true }, distinct: ['userId'] }),
    ])
    const pct = (a: number, b: number) => b > 0 ? (Math.round((a / b) * 1000) / 10).toFixed(1) + '%' : '0%'

    const referrerRow = [{
      总会员: totalUsers, 有推荐人: withReferrer, 推荐转化率: pct(withReferrer, totalUsers),
    }]
    const activityRows = [{
      指标: '7日活跃', 人数: active7d.length, 占总会员比: pct(active7d.length, totalUsers),
    }, {
      指标: '30日活跃', 人数: active30d.length, 占总会员比: pct(active30d.length, totalUsers),
    }, {
      指标: '总下单会员', 人数: totalOrderUsers.length, 占总会员比: pct(totalOrderUsers.length, totalUsers),
    }]

    const csv = [
      `# 会员等级分布（${now.toISOString().slice(0, 10)}）`,
      toCsv(levelRows, [
        { key: 'level', label: '等级' },
        { key: 'label', label: '身份' },
        { key: 'count', label: '人数' },
      ]),
      `# 推荐转化`,
      toCsv(referrerRow, [
        { key: '总会员', label: '总会员' },
        { key: '有推荐人', label: '有推荐人' },
        { key: '推荐转化率', label: '推荐转化率' },
      ]),
      `# 活跃度`,
      toCsv(activityRows, [
        { key: '指标', label: '指标' },
        { key: '人数', label: '人数' },
        { key: '占总会员比', label: '占总会员比' },
      ]),
    ].join('\n')

    const dateStr = now.toISOString().slice(0, 10)
    return csvResponse(csv, `会员报表_${dateStr}`)
  } catch (error) {
    console.error('[Members CSV Export Error]', error)
    return new Response('服务器错误', { status: 500 })
  }
}
