import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'
import { logOperation } from '@/lib/utils/operation-log'
import { OrderService } from '@/lib/services/order.service'
import { OrderLifecycleService } from '@/lib/services/order-lifecycle.service'

// PATCH /api/admin/refunds/[id]/complete — 确认退款完成
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin', 'finance_admin'])
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

    // v54a 修复：调 OrderService.requestRefund 执行实际退款
    // 【函数说明】requestRefund 函数名虽叫"申请退款"，但实际是"执行退款"——完整流程：
    //   1) 退余额到用户余额 + 写 balanceRecord(type=refund)
    //   2) 退积分
    //   3) 扣回已发奖励（referral/brand_bonus）→ 写 balanceRecord(type=refund_reward)
    //   4) 扣回分红 → 写 balanceRecord(type=refund_dividend)
    //   5) 改订单 status=REFUNDED
    // 【安全】requestRefund 内部有状态校验（order.status 必须是 PAID 或 SHIPPED），
    //        重复调会被自然防住（第二次会报"订单状态不允许退款"）。
    await OrderLifecycleService.requestRefund(refundRequest.orderId)

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

    // v46.12: 触发退款完成通知（修复 complete 路由 + requestRefund 都没调 sendInApp 的死代码）
    const refundOrder = await prisma.order.findUnique({
      where: { id: refundRequest.orderId },
      select: { orderNo: true, userId: true, payAmount: true },
    })
    if (refundOrder) {
      await OrderService.notifyRefundCompleted({
        userId: refundOrder.userId,
        orderId: refundRequest.orderId,
        orderNo: refundOrder.orderNo,
        amount: refundOrder.payAmount,
        operatorId: admin.id,
      })
    }

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