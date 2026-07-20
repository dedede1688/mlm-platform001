import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'
import { logOperation } from '@/lib/utils/operation-log'
import { OrderNotificationService } from '@/lib/services/order-notification.service'
import { logger } from '@/lib/logger'

// POST /api/admin/users/[id]/points — 管理员调整会员积分（自动联动）
export async function POST(
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
    const { type, amount, reason } = body

    // 1. 参数校验
    const validTypes = ['totalPoints', 'unlockedPoints', 'lockedPoints'] as const

    if (!type || !validTypes.includes(type as typeof validTypes[number])) {
      return NextResponse.json(
        { success: false, message: 'type 必须为 totalPoints、unlockedPoints 或 lockedPoints' },
        { status: 400 }
      )
    }

    if (typeof amount !== 'number' || isNaN(amount) || amount === 0) {
      return NextResponse.json(
        { success: false, message: 'amount 必须为非零数字' },
        { status: 400 }
      )
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      return NextResponse.json(
        { success: false, message: '原因至少 5 个字' },
        { status: 400 }
      )
    }

    // 2. 事务：查询 + 联动计算 + 校验 + 更新
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id } })

      if (!user || user.status === 'deleted') {
        throw new Error('用户不存在')
      }

      // 当前值
      let total = user.totalPoints
      let unlocked = user.unlockedPoints
      let locked = user.lockedPoints

      // 根据调整类型做联动计算
      const fieldLabel =
        type === 'totalPoints' ? '总积分' :
        type === 'unlockedPoints' ? '可用积分' : '锁定积分'

      switch (type) {
        case 'totalPoints':
          // 调总积分 → 默认联动到可用积分
          total += amount
          unlocked += amount
          break
        case 'unlockedPoints':
          // 调可用积分 → 自动联动总积分
          unlocked += amount
          total += amount
          break
        case 'lockedPoints':
          // 调锁定积分 → 自动联动总积分
          locked += amount
          total += amount
          break
      }

      // 防负数校验
      if (total < 0) throw new Error(`总积分不能为负数，当前调整后为 ${total}`)
      if (unlocked < 0) throw new Error(`可用积分不能为负数，当前调整后为 ${unlocked}`)
      if (locked < 0) throw new Error(`锁定积分不能为负数，当前调整后为 ${locked}`)

      // 执行更新（3 个字段一起更新，保证原子性）
      const updated = await tx.user.update({
        where: { id },
        data: {
          totalPoints: total,
          unlockedPoints: unlocked,
          lockedPoints: locked,
        },
      })

      // v57.2 B: 创建积分明细记录（用户能在积分明细看到调账历史）
      await tx.pointsRecord.create({
        data: {
          userId: id,
          type: 'admin_adjust',
          amount,
          totalPoints: updated.totalPoints,
          unlockedPoints: updated.unlockedPoints,
          lockedPoints: updated.lockedPoints,
          sourceId: admin.id,
          description: `管理员调账：${fieldLabel}${amount > 0 ? '增加' : '扣减'} ${Math.abs(amount)} 积分，原因：${reason.trim()}`,
        },
      })

      return {
        updated,
        oldValue: {
          totalPoints: user.totalPoints,
          unlockedPoints: user.unlockedPoints,
          lockedPoints: user.lockedPoints,
        },
        fieldLabel,
      }
    })

    // 3. 写操作日志
    await logOperation({
      userId: admin.id,
      action: 'UPDATE',
      module: 'user',
      targetId: id,
      oldValue: result.oldValue,
      newValue: {
        totalPoints: result.updated.totalPoints,
        unlockedPoints: result.updated.unlockedPoints,
        lockedPoints: result.updated.lockedPoints,
      },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    const actionLabel = amount > 0 ? '增加' : '扣减'
    logger.info(
      `[PointsAdjust] 用户 ${id} 的${result.fieldLabel}已${actionLabel} ${Math.abs(amount)}，原因：${reason}`
    )

    // v57.2 B: 触发积分变动通知（事务外，参考 balance route 模式）
    await OrderNotificationService.notifyPointsAdjust({
      userId: id,
      fieldLabel: result.fieldLabel,
      amount,
      newTotalPoints: result.updated.totalPoints,
      newUnlockedPoints: result.updated.unlockedPoints,
      newLockedPoints: result.updated.lockedPoints,
      reason: reason.trim(),
      operatorId: admin.id,
    })

    return NextResponse.json({
      success: true,
      data: {
        totalPoints: result.updated.totalPoints,
        unlockedPoints: result.updated.unlockedPoints,
        lockedPoints: result.updated.lockedPoints,
      },
      message: `积分调整成功：${result.fieldLabel}${actionLabel} ${Math.abs(amount)}`,
    })
  } catch (error) {
    console.error('Adjust points error:', error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : '积分调整失败' },
      { status: 500 }
    )
  }
}
