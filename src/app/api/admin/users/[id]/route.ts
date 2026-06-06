import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'

// GET /api/admin/users/[id] — 获取单个会员详情（管理员）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['support_admin', 'super_admin'])
    if (authError || !admin) return authError!

    const { id } = await params
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        // 推荐人信息
        referrer: {
          select: { id: true, phone: true, nickname: true, level: true },
        },
        // 安置上级
        parent: {
          select: { id: true, phone: true, nickname: true, level: true },
        },
        // 直推列表
        referrals: {
          select: {
            id: true,
            phone: true,
            nickname: true,
            level: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        // 安置下级
        children: {
          select: {
            id: true,
            phone: true,
            nickname: true,
            level: true,
            position: true,
          },
          orderBy: { position: 'asc' },
        },
      },
    })

    if (!user || user.status === 'deleted') {
      return NextResponse.json(
        { success: false, message: '用户不存在' },
        { status: 404 }
      )
    }

    // 订单统计
    const orderStats = await prisma.order.aggregate({
      where: { userId: id, status: { in: ['paid', 'shipped', 'completed'] } },
      _sum: { payAmount: true },
      _count: true,
    })

    return NextResponse.json({
      success: true,
      data: {
        ...user,
        orderCount: orderStats._count,
        totalOrderAmount: orderStats._sum.payAmount || 0,
      },
      message: '获取会员详情成功',
    })
  } catch (error) {
    console.error('Admin get user error:', error)
    return NextResponse.json(
      { success: false, message: '获取会员详情失败' },
      { status: 500 }
    )
  }
}

// PUT /api/admin/users/[id] — 更新会员信息（管理员）
// 目前支持：手动调整会员等级
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['support_admin', 'super_admin'])
    if (authError || !admin) return authError!

    const { id } = await params
    const body = await request.json()
    const { level } = body

    // 检查用户是否存在
    const existing = await prisma.user.findUnique({ where: { id } })
    if (!existing || existing.status === 'deleted') {
      return NextResponse.json(
        { success: false, message: '用户不存在' },
        { status: 404 }
      )
    }

    // 验证等级
    if (level === undefined || level === null) {
      return NextResponse.json(
        { success: false, message: '缺少 level 参数' },
        { status: 400 }
      )
    }

    const newLevel = Number(level)
    if (isNaN(newLevel) || newLevel < 0 || newLevel > 7 || !Number.isInteger(newLevel)) {
      return NextResponse.json(
        { success: false, message: '等级必须为 0-7 的整数' },
        { status: 400 }
      )
    }

    // 更新等级
    const updatedUser = await prisma.user.update({
      where: { id },
      data: { level: newLevel },
      select: {
        id: true,
        phone: true,
        nickname: true,
        level: true,
        balance: true,
        totalPoints: true,
        unlockedPoints: true,
        lockedPoints: true,
        upgradeProductCount: true,
        directDistributorCount: true,
        directSalesAmount: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({
      success: true,
      data: updatedUser,
      message: `会员等级已调整为 ${newLevel}`,
    })
  } catch (error) {
    console.error('Admin update user error:', error)
    return NextResponse.json(
      { success: false, message: '更新会员信息失败' },
      { status: 500 }
    )
  }
}