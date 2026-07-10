import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/recharge/[id]/audit-logs
 * 后台充值审核日志（管理员）
 * 返回该充值申请的 RechargeAuditLog 列表，按 createdAt asc 排序（便于按时间顺序展示审核流程）
 * 手动补充 operator 信息：{ id, phone, nickname } | null
 *    （RechargeAuditLog 无 operator 关系定义，只有 operatorId 字段）
 * 权限：finance_admin, super_admin
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error: authError } = await verifyPermission(request, [
      'finance_admin',
      'super_admin',
    ])
    if (authError) return authError

    const { id } = await params

    const logs = await prisma.rechargeAuditLog.findMany({
      where: { requestId: id },
      orderBy: { createdAt: 'asc' },
    })

    // 手动补充 operator 信息（RechargeAuditLog 无 operator 关系定义）
    const operatorIds = logs
      .map((l) => l.operatorId)
      .filter((oid): oid is string => !!oid)

    const operators = operatorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: operatorIds } },
          select: { id: true, phone: true, nickname: true },
        })
      : []

    const operatorMap = new Map(operators.map((o) => [o.id, o]))

    const data = logs.map((log) => ({
      id: log.id,
      requestId: log.requestId,
      action: log.action,
      oldStatus: log.oldStatus,
      newStatus: log.newStatus,
      operatorId: log.operatorId,
      operator: log.operatorId ? operatorMap.get(log.operatorId) || null : null,
      reason: log.reason,
      remark: log.remark,
      createdAt: log.createdAt,
    }))

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Admin get recharge audit logs error:', error)
    return NextResponse.json(
      { success: false, message: '获取充值审核日志失败' },
      { status: 500 }
    )
  }
}
