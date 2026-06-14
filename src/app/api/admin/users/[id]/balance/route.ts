import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'
import { logOperation } from '@/lib/utils/operation-log'

// POST /api/admin/users/[id]/balance — 管理员调整会员资金（余额/冻结余额）
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

    // 类型守卫：确保 type 是合法的字段名
    const field: 'balance' | 'frozenBalance' =
      (type === 'balance' || type === 'frozenBalance') ? type : 'balance'

    // 1. 参数校验
    if (!type || !['balance', 'frozenBalance'].includes(type)) {
      return NextResponse.json(
        { success: false, message: 'type 必须为 balance 或 frozenBalance' },
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

    // 2. 事务：查询 + 校验 + 更新
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id } })

      if (!user || user.status === 'deleted') {
        throw new Error('用户不存在')
      }

      // 扣减时检查是否会导致负数
      const currentVal = field === 'balance' ? user.balance : user.frozenBalance
      if (amount < 0 && currentVal + amount < 0) {
        const fieldLabel = field === 'balance' ? '余额' : '冻结余额'
        throw new Error(`${fieldLabel}不足，当前 ${currentVal}，扣减 ${Math.abs(amount)}`)
      }

      // 原值记录日志用
      const oldValue = { [field]: currentVal }

      const updated = await tx.user.update({
        where: { id },
        data: { [field]: { increment: amount } },
      })

      return { updated, oldValue, field }
    })

    // 3. 写操作日志
    await logOperation({
      userId: admin.id,
      action: 'UPDATE',
      module: 'user',
      targetId: id,
      oldValue: result.oldValue,
      newValue: { [result.field]: result.updated[result.field] },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    // 4. 通知用户（v9 实现通知中心，当前仅记录日志）
    const fieldLabel = result.field === 'balance' ? '余额' : '冻结余额'
    const actionLabel = amount > 0 ? '增加' : '扣减'
    console.log(
      `[BalanceAdjust] 用户 ${id} 的${fieldLabel}已${actionLabel} ¥${Math.abs(amount).toFixed(2)}，原因：${reason}`
    )

    return NextResponse.json({
      success: true,
      data: { [result.field]: result.updated[result.field] },
      message: `资金调整成功：${fieldLabel}${actionLabel} ¥${Math.abs(amount).toFixed(2)}`,
    })
  } catch (error) {
    console.error('Adjust balance error:', error)
    const message = error instanceof Error ? error.message : '资金调整失败'
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    )
  }
}
