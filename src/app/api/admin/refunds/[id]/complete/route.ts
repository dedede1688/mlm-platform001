import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'
import { logOperation } from '@/lib/utils/operation-log'

// PATCH /api/admin/refunds/[id]/complete — 确认退款完成
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['admin', 'super_admin'])
    if (authError || !admin) return authError!

    const refundRequest = await prisma.refundRequest.findUnique({ where: { id } })
    if (!refundRequest) {
      return NextResponse.json(
        { success: false, message: '退款申请不存在' },
        { status: 404 }
      )
    }

    if (refundRequest.status !== 'approved') {
      return NextResponse.json(
        { success: false, message: '仅已通过的申请可确认退款' },
        { status: 400 }
      )
    }

    // 更新状态为 completed
    // TODO: 后续可在此处调用实际退款逻辑（修改用户余额、扣回佣金等）
    const updated = await prisma.refundRequest.update({
      where: { id },
      data: { status: 'completed' },
    })

    // 操作日志
    await logOperation({
      userId: admin.id,
      action: 'COMPLETE_REFUND',
      module: 'refund',
      targetId: id,
      newValue: { status: 'completed' },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    return NextResponse.json({
      success: true,
      data: updated,
      message: '退款已完成',
    })
  } catch (error) {
    console.error('Admin complete refund error:', error)
    return NextResponse.json(
      { success: false, message: '确认退款失败' },
      { status: 500 }
    )
  }
}