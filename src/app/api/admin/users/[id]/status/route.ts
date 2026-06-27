import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'
import { logOperation } from '@/lib/utils/operation-log'
import { OrderNotificationService } from '@/lib/services/order-notification.service'

// PUT /api/admin/users/[id]/status — 管理员变更会员状态（冻结/解封）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin, error: authError } = await verifyPermission(
      request, ['support_admin', 'super_admin']
    )
    if (authError || !admin) return authError!

    const { id } = await params
    const body = await request.json()
    const { status, reason } = body

    // 1. 参数校验
    if (!status || !['active', 'frozen'].includes(status)) {
      return NextResponse.json(
        { success: false, message: 'status 必须为 active 或 frozen' },
        { status: 400 }
      )
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      return NextResponse.json(
        { success: false, message: '原因至少 5 个字' },
        { status: 400 }
      )
    }

    // 2. 查用户并校验
    const existing = await prisma.user.findUnique({ where: { id } })

    if (!existing || existing.status === 'deleted') {
      return NextResponse.json(
        { success: false, message: '用户不存在' },
        { status: 404 }
      )
    }

    if (existing.status === status) {
      return NextResponse.json(
        { success: false, message: '状态未变化' },
        { status: 400 }
      )
    }

    // 3. 更新状态
    const updated = await prisma.user.update({
      where: { id },
      data: { status },
    })

    // 4. 写操作日志（oldValue/newValue 风格）
    await logOperation({
      userId: admin.id,
      action: 'UPDATE',
      module: 'user',
      targetId: id,
      oldValue: { status: existing.status },
      newValue: { status: updated.status },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    // v54 阶段4: 通知用户账户状态变更
    await OrderNotificationService.notifyUserStatusChange({
      userId: id,
      status,
      reason,
      operatorId: admin.id,
    })

    const actionLabel = status === 'active' ? '解封' : '冻结'

    return NextResponse.json({
      success: true,
      data: { status: updated.status },
      message: `状态已${actionLabel}`,
    })
  } catch (error) {
    console.error('Change status error:', error)
    return NextResponse.json(
      { success: false, message: '状态变更失败' },
      { status: 500 }
    )
  }
}
