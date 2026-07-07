import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'
import { logOperation } from '@/lib/utils/operation-log'
import { WITHDRAWAL_STATUS } from '@/lib/constants'
import { WithdrawalService } from '@/lib/services/withdrawal.service'
import { WithdrawalAuditLogService } from '@/lib/services/withdrawal-audit-log.service'
import { NotificationService } from '@/lib/services/notification.service'

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
      completedBy: w.completedBy,
      completedAt: w.completedAt,
      paymentProofUrl: w.paymentProofUrl,
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
// 请求体：{ id, action: 'approve' | 'reject', rejectReason?, rejectTemplateId?, remark? }
export async function PUT(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['finance_admin', 'super_admin'])
    if (authError || !admin) return authError!

    const { id, action, rejectReason, rejectTemplateId, remark } = await request.json()

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

    const approved = action === 'approve'

    const updated = await WithdrawalService.reviewWithdrawal(id, {
      approved,
      reviewedBy: admin.id,
      rejectReason,
      rejectTemplateId,
      remark,
    })

    await logOperation({
      userId: admin.id,
      action: approved ? 'APPROVE' : 'REJECT',
      module: 'finance',
      targetId: id,
      oldValue: { status: WITHDRAWAL_STATUS.PENDING },
      newValue: {
        status: approved ? WITHDRAWAL_STATUS.APPROVED : WITHDRAWAL_STATUS.REJECTED,
        ...(approved ? {} : { rejectReason: rejectReason || null }),
      },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    return NextResponse.json({
      success: true,
      data: updated,
      message: approved ? '提现已审核通过，等待线下打款' : '提现已拒绝，冻结收益已退回可提现收益',
    })
  } catch (error: any) {
    console.error('Admin review withdrawal error:', error)
    const status = error.message === '提现记录不存在' ? 404
      : error.message === '提现记录已处理' ? 400
      : 500
    return NextResponse.json(
      { success: false, message: error.message || '审核提现失败' },
      { status }
    )
  }
}