import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { RechargeService } from '@/lib/services/recharge.service'
import { logOperation } from '@/lib/utils/operation-log'
import { OrderNotificationService } from '@/lib/services/order-notification.service'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

/**
 * PATCH /api/admin/recharge/[id]/review
 * 审核充值申请（仅 super_admin / finance_admin）
 *
 * body:
 * {
 *   action: "approve" | "reject",
 *   rejectReason?: string,
 *   rejectTemplateId?: string,
 *   remark?: string
 * }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 鉴权：只允许 super_admin 和 finance_admin
    const { user: admin, error: authError } = await verifyPermission(request, [
      'finance_admin',
      'super_admin',
    ])
    if (authError || !admin) return authError!

    const { id } = await params
    const { action, rejectReason, rejectTemplateId, remark } = await request.json()

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { success: false, message: 'action 必须为 approve 或 reject' },
        { status: 400 }
      )
    }

    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null
    const userAgent = request.headers.get('user-agent') || null

    if (action === 'approve') {
      const updated = await RechargeService.approveRecharge(id, admin.id, remark)

      // 操作日志在 route 层写，失败不影响主流程
      await logOperation({
        userId: admin.id,
        action: 'APPROVE',
        module: 'finance',
        targetId: id,
        ip: ip || undefined,
        userAgent: userAgent || undefined,
      }).catch(() => {})

      // 通知用户：充值审核通过（非阻塞，失败不影响主流程）
      if (updated) {
        try {
          const userAfterApprove = await prisma.user.findUnique({
            where: { id: updated.userId },
            select: { balance: true },
          })
          if (!userAfterApprove || typeof userAfterApprove.balance !== 'number' || isNaN(userAfterApprove.balance)) {
            console.error('[v3.2-1-hotfix notifyRechargeApproved] 跳过通知：无法获取用户余额', {
              userId: updated.userId,
              rechargeId: id,
              balance: userAfterApprove?.balance,
            })
            logger.error('充值审核通过通知跳过：无法获取用户余额', {
              userId: updated.userId,
              rechargeId: id,
            })
          } else {
            await OrderNotificationService.notifyRechargeApproved({
              userId: updated.userId,
              amount: updated.amount,
              newBalance: userAfterApprove.balance,
              operatorId: admin.id,
            }).catch(() => {})
          }
        } catch (err) {
          console.error('[v3.2-1-hotfix notifyRechargeApproved] 查询用户余额失败，跳过通知', {
            error: String(err),
            userId: updated.userId,
            rechargeId: id,
          })
          logger.error('充值审核通过通知跳过：查询用户余额失败', {
            error: String(err),
            userId: updated.userId,
          })
        }
      }

      return NextResponse.json({
        success: true,
        data: updated,
        message: '充值审核通过，余额已入账',
      })
    } else {
      // reject 必须有 rejectReason 或 rejectTemplateId
      if (!rejectReason && !rejectTemplateId) {
        return NextResponse.json(
          { success: false, message: '请填写拒绝原因或选择拒绝模板' },
          { status: 400 }
        )
      }

      const updated = await RechargeService.rejectRecharge(
        id,
        admin.id,
        rejectReason || '',
        rejectTemplateId,
        remark
      )

      // 操作日志在 route 层写，失败不影响主流程
      await logOperation({
        userId: admin.id,
        action: 'REJECT',
        module: 'finance',
        targetId: id,
        ip: ip || undefined,
        userAgent: userAgent || undefined,
      }).catch(() => {})

      // 通知用户：充值审核拒绝（非阻塞，失败不影响主流程）
      if (updated) {
        await OrderNotificationService.notifyRechargeRejected({
          userId: updated.userId,
          amount: updated.amount,
          rejectReason: updated.rejectReason || rejectReason || '',
          operatorId: admin.id,
        }).catch(() => {})
      }

      return NextResponse.json({
        success: true,
        data: updated,
        message: '充值已拒绝',
      })
    }
  } catch (error: any) {
    console.error('Admin review recharge error:', error)
    const message = error?.message || '审核充值申请失败'
    const status =
      message === '充值申请不存在' ? 404 :
      message === '充值申请不存在或已审核' ? 400 :
      message === '请填写拒绝原因或选择拒绝模板' ? 400 :
      500
    return NextResponse.json(
      { success: false, message },
      { status }
    )
  }
}
