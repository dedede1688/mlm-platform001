import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPermission } from '@/lib/utils/admin-auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: _admin, error: authError } = await verifyPermission(
      request, ['support_admin', 'super_admin']
    )
    if (authError || !_admin) return authError!

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)
    const type = searchParams.get('type') || undefined
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined

    const skip = (page - 1) * limit

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, phone: true, nickname: true, balance: true, frozenBalance: true, status: true },
    })
    if (!user || user.status === 'deleted') {
      return NextResponse.json(
        { success: false, message: '用户不存在' },
        { status: 404 }
      )
    }

    const where: Record<string, unknown> = { userId: id }
    if (type) {
      const types = type.split(',')
      where.type = types.length === 1 ? types[0] : { in: types }
    }
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) (where.createdAt as Record<string, unknown>).gte = new Date(startDate)
      if (endDate) (where.createdAt as Record<string, unknown>).lte = new Date(endDate)
    }

    const [records, total] = await Promise.all([
      prisma.balanceRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.balanceRecord.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          phone: user.phone,
          nickname: user.nickname,
          balance: user.balance,
          frozenBalance: user.frozenBalance,
        },
        records,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    })
  } catch (error) {
    console.error('Admin get balance records error:', error)
    return NextResponse.json(
      { success: false, message: '获取余额流水失败' },
      { status: 500 }
    )
  }
}