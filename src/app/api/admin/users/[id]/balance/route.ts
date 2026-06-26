import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'
import { logOperation } from '@/lib/utils/operation-log'
import { OrderService } from '@/lib/services/order.service'

const VALID_TYPES = ['balance', 'frozenBalance', 'recharge', 'consume_void', 'earnings_add', 'earnings_void'] as const
type AdjustType = typeof VALID_TYPES[number]

const TYPE_FIELD_MAP: Record<AdjustType, { main: 'balance' | 'frozenBalance'; extra?: 'consumeBalance' | 'earningsAvailable' | 'earningsVoided'; label: string }> = {
  balance:          { main: 'balance',          label: '余额' },
  frozenBalance:    { main: 'frozenBalance',    label: '冻结余额' },
  recharge:         { main: 'balance', extra: 'consumeBalance',     label: '余额/消费余额' },
  consume_void:     { main: 'balance', extra: 'consumeBalance',     label: '余额/消费余额' },
  earnings_add:     { main: 'balance', extra: 'earningsAvailable',  label: '余额/可提现收益' },
  earnings_void:    { main: 'balance', extra: 'earningsVoided',     label: '余额/累计作废' },
}

const TYPE_EXTRA_SIGN: Partial<Record<AdjustType, 1 | -1>> = {
  recharge: 1, consume_void: -1, earnings_add: 1, earnings_void: 1,
}

function getFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    consumeBalance: '消费余额',
    earningsPending: '待结算收益',
    earningsAvailable: '可提现收益',
    earningsVoided: '累计作废',
    balance: '余额',
    frozenBalance: '冻结余额',
  }
  return labels[field] ?? field
}

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

    if (!type || !VALID_TYPES.includes(type as AdjustType)) {
      return NextResponse.json(
        { success: false, message: `type 必须为 ${VALID_TYPES.join(' / ')}` },
        { status: 400 }
      )
    }

    const adjustType: AdjustType = type as AdjustType

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

    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id } })
      if (!before || before.status === 'deleted') {
        throw new Error('用户不存在')
      }

      const mapping = TYPE_FIELD_MAP[adjustType]
      const extraSign = TYPE_EXTRA_SIGN[adjustType] ?? 1

      const updateData: Record<string, { increment: number }> = {
        [mapping.main]: { increment: amount },
      }
      if (mapping.extra && extraSign !== undefined) {
        updateData[mapping.extra] = { increment: amount * extraSign }
      }

      const mainWhereCond = amount < 0 ? { gte: Math.abs(amount) } : undefined
      const updateResult = await tx.user.updateMany({
        where: { id, ...(mainWhereCond ? { [mapping.main]: mainWhereCond } : {}) },
        data: updateData,
      })
      if (updateResult.count === 0) throw new Error(`${mapping.label}不足`)

      const newBalance = mapping.main === 'balance' ? before.balance + amount : before.balance
      const newFrozenBalance = mapping.main === 'frozenBalance' ? before.frozenBalance + amount : before.frozenBalance
      const oldValue: Record<string, unknown> = {
        [mapping.main]: mapping.main === 'balance' ? before.balance : before.frozenBalance,
      }
      if (mapping.extra) {
        oldValue[mapping.extra] = (before as Record<string, unknown>)[mapping.extra] ?? 0
      }

      const extraDesc = mapping.extra
        ? `，${getFieldLabel(mapping.extra)}${amount * extraSign > 0 ? '增加' : '扣减'} ¥${Math.abs(amount).toFixed(2)}`
        : ''
      await tx.balanceRecord.create({
        data: {
          userId: id,
          type: 'admin_adjust',
          amount,
          balance: newBalance,
          frozenBalance: newFrozenBalance,
          sourceType: 'admin',
          sourceId: admin.id,
          description: `管理员调账：${mapping.label}${amount > 0 ? '增加' : '扣减'} ¥${Math.abs(amount).toFixed(2)}${extraDesc}，原因：${reason}`,
        },
      })

      const updated = await tx.user.findUnique({ where: { id } })
      if (!updated) throw new Error('用户更新后查询失败')
      return { updated, oldValue, adjustType, mapping }
    })

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
      newValue: { [result.mapping.main]: result.updated[result.mapping.main] },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    // v46.11: 触发余额变动通知（修复调账路由没调 sendInApp 的死代码问题）
    await OrderService.notifyBalanceChange({
      userId: id,
      adjustType: type as string,
      amount,
      newBalance: result.updated.balance,
      reason: reason.trim(),
      operatorId: admin.id,
    })

    const fieldLabel = result.mapping.label
    const actionLabel = amount > 0 ? '增加' : '扣减'
    console.log(
      `[BalanceAdjust] 用户 ${id} 的${fieldLabel}已${actionLabel} ¥${Math.abs(amount).toFixed(2)}，原因：${reason}`
    )

    const responseData: Record<string, number> = {
      [result.mapping.main]: result.updated[result.mapping.main] as number,
    }
    if (result.mapping.extra) {
      responseData[result.mapping.extra] = (result.updated as Record<string, unknown>)[result.mapping.extra] as number
    }

    return NextResponse.json({
      success: true,
      data: responseData,
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
