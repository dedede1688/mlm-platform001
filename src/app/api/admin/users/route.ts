import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'

// GET /api/admin/users — 获取会员列表（管理员）
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['support_admin', 'super_admin'])
    if (authError || !admin) return authError!

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20')))
    const levelParam = searchParams.get('level')?.trim() || ''
    const search = searchParams.get('search')?.trim() || ''
    const statusParam = searchParams.get('status')?.trim() || ''
    const startDate = searchParams.get('startDate')?.trim() || ''
    const endDate = searchParams.get('endDate')?.trim() || ''
    const sortBy = searchParams.get('sortBy')?.trim() || 'createdAt'
    const sortOrder = searchParams.get('sortOrder')?.trim() || 'desc'

    // 构建查询条件
    const where: Record<string, unknown> = {
      status: { not: 'deleted' },
    }

    if (levelParam !== '') {
      where.level = parseInt(levelParam)
    }

    // 状态筛选
    if (statusParam && statusParam !== 'all') {
      where.status = statusParam
    }

    // 注册时间范围筛选
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) {
        (where.createdAt as Record<string, Date>).gte = new Date(startDate)
      }
      if (endDate) {
        (where.createdAt as Record<string, Date>).lte = new Date(endDate + 'T23:59:59.999Z')
      }
    }

    if (search) {
      where.OR = [
        { phone: { contains: search } },
        { nickname: { contains: search } },
      ]
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          phone: true,
          nickname: true,
          level: true,
          balance: true,
          frozenBalance: true,
          consumeBalance: true,
          earningsPending: true,
          earningsAvailable: true,
          earningsVoided: true,
          totalPoints: true,
          unlockedPoints: true,
          lockedPoints: true,
          referrerId: true,
          parentId: true,
          position: true,
          upgradeProductCount: true,
          directSalesAmount: true,
          directDistributorCount: true,
          status: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          // v018: 用于返回 hasPaymentPassword 布尔值，不泄露哈希值
          paymentPasswordHash: true,
          referrer: {
            select: { id: true, nickname: true, phone: true },
          },
          _count: {
            select: { referrals: true },
          },
          orders: {
            where: { status: { in: ['paid', 'shipped', 'completed'] } },
            select: { payAmount: true },
          },
        },
      }),
      prisma.user.count({ where }),
    ])

    // 格式化返回数据
    const data = users.map(u => {
      const orderCount = u.orders?.length || 0
      const totalOrderAmount = u.orders?.reduce((sum, o) => sum + (o.payAmount || 0), 0) || 0
      const { orders: _orders, _count, referrerId: _referrerId, paymentPasswordHash: _paymentHash, ...rest } = u
      // v018: 构造返回对象，防御性删除敏感字段（即使底层数据源绕过 Prisma select 返回了 passwordHash）
      const result: Record<string, unknown> = {
        ...rest,
        hasPaymentPassword: !!_paymentHash,
        referrer: u.referrer
          ? { id: u.referrer.id, nickname: u.referrer.nickname, phone: u.referrer.phone }
          : null,
        directReferralCount: _count?.referrals || 0,
        orderCount,
        totalOrderAmount,
      }
      // 确保不泄露 passwordHash（Prisma select 已排除，此处为防御性兜底）
      delete result.passwordHash
      return result as typeof rest & { hasPaymentPassword: boolean }
    })

    return NextResponse.json({
      success: true,
      data,
      message: '获取会员列表成功',
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('Admin get users error:', error)
    return NextResponse.json(
      { success: false, message: '获取会员列表失败' },
      { status: 500 }
    )
  }
}