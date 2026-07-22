import { NextRequest } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'
import { errorResponse, successResponse } from '@/lib/api-response'
import { logOperation } from '@/lib/utils/operation-log'
import { OrderNotificationService } from '@/lib/services/order-notification.service'

// POST /api/admin/users/[id]/payment-password/reset — 超级管理员重置支付密码
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. 鉴权 - 只允许超级管理员
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError || !admin) {
      // 如果 error 对象本身就是响应，直接返回其 status
      // verifyPermission 返回的 error 已经是 NextResponse
      if (authError) {
        return authError
      }
      return errorResponse('权限不足', 403)
    }

    // 1.5 显式校验必须是超级管理员（防御性编程，防止 verifyPermission 被 bypass）
    if (admin.role !== 'super_admin') {
      return errorResponse('权限不足，仅超级管理员可执行此操作', 403)
    }

    // 2. 解析请求体
    const body = await request.json()
    const { reason, phoneSuffix } = body as { reason: string; phoneSuffix: string }

    // 3. 参数校验
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      return errorResponse('原因不能为空且不少于 5 个字', 400)
    }

    if (!phoneSuffix || typeof phoneSuffix !== 'string' || !/^\d{4}$/.test(phoneSuffix)) {
      return errorResponse('手机号后 4 位必须为 4 位数字', 400)
    }

    // 4. 获取目标用户
    const { id: userId } = await params
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        status: true,
        paymentPasswordHash: true,
      },
    })

    // 5. 用户不存在或已删除
    if (!targetUser || targetUser.status === 'deleted') {
      return errorResponse('用户不存在', 404)
    }

    // 6. 手机号后 4 位校验
    const actualSuffix = targetUser.phone.slice(-4)
    if (phoneSuffix !== actualSuffix) {
      return errorResponse('手机号后 4 位不匹配', 400)
    }

    // 7. 用户未设置支付密码
    if (!targetUser.paymentPasswordHash) {
      return errorResponse('用户未设置支付密码，无需重置', 400)
    }

    // 8. 条件更新 - 防止并发重复重置
    const updated = await prisma.user.updateMany({
      where: {
        id: userId,
        paymentPasswordHash: { not: null },
      },
      data: { paymentPasswordHash: null, failedAttempts: 0, lockedUntil: null },
    })

    // 9. 条件更新未命中（状态已被其他操作改变）
    if (updated.count !== 1) {
      return errorResponse('支付密码状态已变更，请刷新后重试', 409, { code: 'CONFLICT' })
    }

    // 10. 写操作日志（不含任何密码值）
    await logOperation({
      userId: admin.id,
      action: 'UPDATE',
      module: 'user',
      targetId: userId,
      oldValue: { paymentPasswordStatus: '已设置' },
      newValue: {
        paymentPasswordStatus: '已清除',
        reason: reason.trim(),
        phoneSuffix,
      },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    // 11. 发送站内通知（失败不阻塞主流程）
    try {
      await OrderNotificationService.notifyPaymentPasswordReset({
        userId,
        operatorId: admin.id,
      })
    } catch (notifyErr) {
      // 通知失败不阻塞
      console.error('[payment-password/reset] 通知失败:', notifyErr)
    }

    // 12. 返回成功
    return successResponse(
      { hasPaymentPassword: false },
      '支付密码已重置，请通知用户重新设置'
    )
  } catch (error: any) {
    console.error('[payment-password/reset] 未知错误:', error)
    return errorResponse('服务器内部错误', 500)
  }
}
