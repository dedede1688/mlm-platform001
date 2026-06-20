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

    // 2. 事务：查询旧值 + 原子校验更新 + BalanceRecord 流水（v43-7 Batch 2）
    const result = await prisma.$transaction(async (tx) => {
      // 步骤 1：查旧值
      const before = await tx.user.findUnique({ where: { id } })
      if (!before || before.status === 'deleted') {
        throw new Error('用户不存在')
      }

      // 步骤 2：变更（updateMany + where 防并发透支）
      const updateResult = await tx.user.updateMany({
        where: {
          id,
          [field]: amount < 0 ? { gte: Math.abs(amount) } : undefined,
        },
        data: { [field]: { increment: amount } },
      })
      if (updateResult.count === 0) {
        const fieldLabel = field === 'balance' ? '余额' : '冻结余额'
        throw new Error(`${fieldLabel}不足`)
      }

      // 步骤 3：用旧值+变动量计算新值
      const newBalance = field === 'balance' ? before.balance + amount : before.balance
      const newFrozenBalance = field === 'frozenBalance' ? before.frozenBalance + amount : before.frozenBalance
      const oldValue = { [field]: field === 'balance' ? before.balance : before.frozenBalance }

      // 步骤 4：写 BalanceRecord
      await tx.balanceRecord.create({
        data: {
          userId: id,
          type: 'admin_adjust',
          amount,
          balance: newBalance,
          frozenBalance: newFrozenBalance,
          sourceType: 'admin',
          sourceId: admin.id,
          description: `管理员调账：${field === 'balance' ? '余额' : '冻结余额'}${amount > 0 ? '增加' : '扣减'} ¥${Math.abs(amount).toFixed(2)}，原因：${reason}`,
        },
      })

      const updated = await tx.user.findUnique({ where: { id } })
      if (!updated) throw new Error('用户更新后查询失败')
      return { updated, oldValue, field }
    })

    // 3. 写操作日志
    if (!result.updated) {
      return NextResponse.json(
        { success: false, message: '更新后查询用户失败' },
        { status: 500 }
      )
    }
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
