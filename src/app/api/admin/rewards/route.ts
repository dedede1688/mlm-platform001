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

    // 构建奖励查询条件
    const rewardWhere: Record<string, unknown> = {}

    if (type) {
      rewardWhere.type = type
    }

    if (search) {
      rewardWhere.user = {
        OR: [
          { phone: { contains: search } },
          { nickname: { contains: search } },
        ],
      }
    }

    if (startDate || endDate) {
      const createdAt: Record<string, Date> = {}
      if (startDate) createdAt.gte = new Date(startDate)
      if (endDate) createdAt.lte = new Date(new Date(endDate).setHours(23, 59, 59, 999))
      rewardWhere.createdAt = createdAt
    }

    const [rewards, total] = await Promise.all([
      prisma.reward.findMany({
        where: rewardWhere,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: { id: true, phone: true, nickname: true, level: true },
          },
          order: {
            select: { id: true, orderNo: true },
          },
        },
      }),
      prisma.reward.count({ where: rewardWhere }),
    ])

    // 同时获取分红记录（视为 dividend 类型奖励）
    const dividendWhere: Record<string, unknown> = {}
    if (type && type !== 'dividend') {
      // 如果筛选类型不是 dividend，则不查分红
    } else {
      if (search) {
        dividendWhere.user = {
          OR: [
            { phone: { contains: search } },
            { nickname: { contains: search } },
          ],
        }
      }
      if (startDate || endDate) {
        const createdAt: Record<string, Date> = {}
        if (startDate) createdAt.gte = new Date(startDate)
        if (endDate) createdAt.lte = new Date(new Date(endDate).setHours(23, 59, 59, 999))
        dividendWhere.createdAt = createdAt
      }
    }

    let dividends: Array<{
      id: string
      userId: string
      user: { id: string; phone: string; nickname: string | null; level: number }
      type: string
      amount: number
      orderId: string
      status: string
      createdAt: Date
      order: { id: string; orderNo: string } | null
    }> = []

    let dividendTotal = 0

    if (!type || type === 'dividend') {
      const [divs, dTotal] = await Promise.all([
        prisma.dividend.findMany({
          where: dividendWhere,
          orderBy: { createdAt: 'desc' },
          skip: type === 'dividend' ? (page - 1) * pageSize : 0,
          take: type === 'dividend' ? pageSize : 1000,
          include: {
            user: {
              select: { id: true, phone: true, nickname: true, level: true },
            },
            order: {
              select: { id: true, orderNo: true },
            },
          },
        }),
        prisma.dividend.count({ where: dividendWhere }),
      ])

      dividends = divs.map(d => ({
        id: d.id,
        userId: d.userId,
        user: d.user,
        type: 'dividend',
        amount: d.amount,
        orderId: d.orderId,
        status: 'paid',
        createdAt: d.createdAt,
        order: d.order ? { id: d.order.id, orderNo: d.order.orderNo } : null,
      }))
      dividendTotal = dTotal
    }

    // 如果只查分红，直接返回分红
    if (type === 'dividend') {
      return NextResponse.json({
        success: true,
        data: dividends,
        message: '获取奖励流水成功',
        pagination: {
          page,
          pageSize,
          total: dividendTotal,
          totalPages: Math.ceil(dividendTotal / pageSize),
        },
      })
    }

    // 合并奖励和分红，按时间倒序
    const allRewards = [
      ...rewards.map(r => ({
        id: r.id,
        userId: r.userId,
        user: r.user,
        type: r.type,
        amount: r.amount,
        orderId: r.orderId,
        orderNo: r.order?.orderNo || null,
        fromUserId: r.fromUserId,
        level: r.level,
        status: r.status,
        createdAt: r.createdAt,
      })),
      ...dividends.map(d => ({
        id: d.id,
        userId: d.userId,
        user: d.user,
        type: d.type,
        amount: d.amount,
        orderId: d.orderId,
        orderNo: d.order?.orderNo || null,
        fromUserId: null,
        level: null,
        status: d.status,
        createdAt: d.createdAt,
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const totalCount = total + dividendTotal

    return NextResponse.json({
      success: true,
      data: allRewards,
      message: '获取奖励流水成功',
      pagination: {
        page,
        pageSize,
        total: totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    })
  } catch (error) {
    console.error('Admin get rewards error:', error)
    return NextResponse.json(
      { success: false, message: '获取奖励流水失败' },
      { status: 500 }
    )
  }
}