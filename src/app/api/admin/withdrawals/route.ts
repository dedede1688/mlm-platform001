import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'
import { logOperation } from '@/lib/utils/operation-log'

// GET /api/admin/withdrawals — 获取提现申请列表（管理员）
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['finance_admin', 'super_admin'])
    if (authError || !admin) return authError!

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20')))
    const status = searchParams.get('status')?.trim() || ''
    const search = searchParams.get('search')?.trim() || ''

    // 构建查询条件
    const where: Record<string, unknown> = {}

    if (status) {
      where.status = status
    }

    if (search) {
      where.user = {
        OR: [
          { phone: { contains: search } },
          { nickname: { contains: search } },
        ],
      }
    }

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: { id: true, phone: true, nickname: true, level: true },
          },
        },
      }),
      prisma.withdrawal.count({ where }),
    ])

    // 补充审核人信息
    const reviewerIds = withdrawals
      .map(w => w.reviewedBy)
      .filter((id): id is string => !!id)

    const reviewers = reviewerIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: reviewerIds } },
          select: { id: true, phone: true, nickname: true },
        })
      : []

    const reviewerMap = new Map(reviewers.map(r => [r.id, r]))

    const data = withdrawals.map(w => ({
      id: w.id,
      userId: w.userId,
      user: w.user,
      amount: w.amount,
      status: w.status,
      rejectReason: w.rejectReason,
      reviewedBy: w.reviewedBy,
      reviewer: w.reviewedBy ? reviewerMap.get(w.reviewedBy) || null : null,
      reviewedAt: w.reviewedAt,
      paidAt: w.paidAt,
      createdAt: w.createdAt,
    }))

    return NextResponse.json({
      success: true,
      data,
      message: '获取提现列表成功',
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('Admin get withdrawals error:', error)
    return NextResponse.json(
      { success: false, message: '获取提现列表失败' },
      { status: 500 }
    )
  }
}

// PUT /api/admin/withdrawals — 审核提现申请（管理员）
// 请求体：{ id, action: 'approve' | 'reject', rejectReason? }
export async function PUT(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['finance_admin', 'super_admin'])
    if (authError || !admin) return authError!

    const { id, action, rejectReason } = await request.json()

    if (!id) {
      return NextResponse.json(
        { success: false, message: '缺少提现记录 ID' },
        { status: 400 }
      )
    }

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { success: false, message: 'action 必须为 approve 或 reject' },
        { status: 400 }
      )
    }

    // 查找提现记录
    const withdrawal = await prisma.withdrawal.findUnique({ where: { id } })
    if (!withdrawal) {
      return NextResponse.json(
        { success: false, message: '提现记录不存在' },
        { status: 404 }
      )
    }

    if (withdrawal.status !== 'pending') {
      return NextResponse.json(
        { success: false, message: '只能审核待处理的提现申请' },
        { status: 400 }
      )
    }

    if (action === 'approve') {
      // 审核通过：扣减余额 + 更新状态为 completed
      const user = await prisma.user.findUnique({ where: { id: withdrawal.userId } })
      if (!user) {
        return NextResponse.json(
          { success: false, message: '用户不存在' },
          { status: 404 }
        )
      }

      if (user.balance < withdrawal.amount) {
        return NextResponse.json(
          { success: false, message: '用户余额不足，无法通过审核' },
          { status: 400 }
        )
      }

      // 使用事务保证原子性
      const updated = await prisma.$transaction(async (tx) => {
        // 扣减余额
        await tx.user.update({
          where: { id: withdrawal.userId },
          data: { balance: { decrement: withdrawal.amount } },
        })

        // 更新提现记录
        return tx.withdrawal.update({
          where: { id },
          data: {
            status: 'completed',
            reviewedBy: admin.id,
            reviewedAt: new Date(),
            paidAt: new Date(),
          },
          include: {
            user: {
              select: { id: true, phone: true, nickname: true },
            },
          },
        })
      })

      // 记录操作日志 - 审核通过
      await logOperation({
        userId: admin.id,
        action: 'APPROVE',
        module: 'finance',
        targetId: id,
        oldValue: { status: 'pending' },
        newValue: { status: 'completed', amount: withdrawal.amount },
        ip: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      })

      return NextResponse.json({
        success: true,
        data: updated,
        message: '提现已通过，余额已扣减',
      })
    }

    if (action === 'reject') {
      // 审核拒绝：仅更新状态
      const updated = await prisma.withdrawal.update({
        where: { id },
        data: {
          status: 'rejected',
          reviewedBy: admin.id,
          reviewedAt: new Date(),
          rejectReason: rejectReason || null,
        },
        include: {
          user: {
            select: { id: true, phone: true, nickname: true },
          },
        },
      })

      // 记录操作日志 - 审核拒绝
      await logOperation({
        userId: admin.id,
        action: 'REJECT',
        module: 'finance',
        targetId: id,
        oldValue: { status: 'pending' },
        newValue: { status: 'rejected', rejectReason: rejectReason || null },
        ip: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      })

      return NextResponse.json({
        success: true,
        data: updated,
        message: '提现已拒绝',
      })
    }

    return NextResponse.json(
      { success: false, message: '未知操作' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Admin review withdrawal error:', error)
    return NextResponse.json(
      { success: false, message: '审核提现失败' },
      { status: 500 }
    )
  }
}