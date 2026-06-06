import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'

// GET /api/admin/statistics/user-growth — 近N天新增会员趋势
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin', 'goods_admin', 'finance_admin', 'support_admin', 'auditor'])
    if (authError || !admin) return authError!

    const { searchParams } = new URL(request.url)
    const days = Math.min(30, Math.max(1, parseInt(searchParams.get('days') || '7')))

    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1)

    // 查询时间范围内新增的用户
    const users = await prisma.user.findMany({
      where: {
        createdAt: { gte: startDate },
        status: { not: 'deleted' },
      },
      select: {
        createdAt: true,
      },
    })

    // 按天分组
    const dailyMap = new Map<string, number>()

    // 初始化所有天
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate)
      d.setDate(d.getDate() + i)
      const key = formatDate(d)
      dailyMap.set(key, 0)
    }

    // 累加用户数据
    for (const user of users) {
      const key = formatDate(user.createdAt)
      const count = dailyMap.get(key)
      if (count !== undefined) {
        dailyMap.set(key, count + 1)
      }
    }

    // 转为数组并排序
    const result = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, newUsers]) => ({
        date,
        newUsers,
      }))

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('[User Growth Statistics Error]', error)
    return NextResponse.json(
      { success: false, message: '服务器错误' },
      { status: 500 }
    )
  }
}

/** 格式化日期为 YYYY-MM-DD */
function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}