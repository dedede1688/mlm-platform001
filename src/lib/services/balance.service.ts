import { prisma } from '@/lib/prisma'
import { format4FieldDelta } from '@/lib/utils/balance-record-desc'

const VALID_TYPES = ['balance', 'frozenBalance', 'recharge', 'consume_void', 'earnings_add', 'earnings_void'] as const
type AdjustType = typeof VALID_TYPES[number]

const TYPE_FIELD_MAP: Record<AdjustType, { main: string; extra?: string; label: string }> = {
  balance:       { main: 'balance',           label: '余额' },
  frozenBalance: { main: 'frozenBalance',     label: '冻结余额' },
  recharge:      { main: 'balance', extra: 'consumeBalance', label: '余额/消费余额' },
  consume_void:  { main: 'balance', extra: 'consumeBalance', label: '余额/消费余额' },
  earnings_add:  { main: 'earningsAvailable',  label: '可提现收益' },
  earnings_void: { main: 'earningsVoided',     label: '累计作废' },
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

export class BalanceService {
  static async adjustBalance(params: {
    userId: string
    adminId: string
    type: string
    amount: number
    reason: string
  }) {
    const { userId, adminId, type, amount, reason } = params

    if (!type || !VALID_TYPES.includes(type as AdjustType)) {
      throw new Error(`type 必须为 ${VALID_TYPES.join(' / ')}`)
    }
    const adjustType: AdjustType = type as AdjustType

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount === 0) {
      throw new Error('amount 必须为非零有限数字')
    }

    if (adjustType === 'earnings_void' && amount <= 0) {
      throw new Error('作废收益金额必须为正数')
    }

    return prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id: userId } })
      if (!before || before.status === 'deleted') {
        throw new Error('用户不存在')
      }

      const mapping = TYPE_FIELD_MAP[adjustType]

      if (adjustType === 'earnings_void') {
        const voidResult = await tx.user.updateMany({
          where: { id: userId, earningsAvailable: { gte: amount } },
          data: {
            earningsAvailable: { decrement: amount },
            earningsVoided: { increment: amount },
          },
        })
        if (voidResult.count === 0) throw new Error('可用收益不足')

        const updated = await tx.user.findUnique({ where: { id: userId } })
        if (!updated) throw new Error('用户更新后查询失败')

        const actualOld = {
          earningsAvailable: updated.earningsAvailable + amount,
          earningsVoided: updated.earningsVoided - amount,
        }

        const after4Field = {
          consumeBalance: before.consumeBalance,
          earningsAvailable: updated.earningsAvailable,
          earningsPending: before.earningsPending,
          earningsVoided: updated.earningsVoided,
        }

        const balanceRecord = await tx.balanceRecord.create({
          data: {
            userId,
            type: adjustType,
            amount,
            balance: before.balance,
            frozenBalance: before.frozenBalance,
            sourceType: 'admin',
            sourceId: adminId,
            description: `管理员调账：${mapping.label}作废 ¥${Math.abs(amount).toFixed(2)}，原因：${reason}${format4FieldDelta(before, after4Field)}`,
          },
        })

        return {
          updated,
          oldValue: actualOld,
          mapping,
          balanceRecordId: balanceRecord.id,
        }
      }

      // Other types: compute new values
      const extraSign = (adjustType === 'recharge' ? 1 : adjustType === 'consume_void' ? -1 : 0)
      let newBalance = before.balance
      let newFrozenBalance = before.frozenBalance

      if (mapping.main === 'balance') {
        newBalance = before.balance + amount
      }
      if (mapping.main === 'frozenBalance') {
        newFrozenBalance = before.frozenBalance + amount
      }
      if (mapping.main === 'earningsAvailable') {
        // earnings_add: only change earningsAvailable, not balance
      }

      if (mapping.extra === 'consumeBalance') {
        const newConsume = before.consumeBalance + amount * extraSign
        if (newConsume < 0) throw new Error('消费余额不能为负数')
      }

      const updateData: Record<string, number> = {}
      if (mapping.main === 'balance' || mapping.main === 'frozenBalance' || mapping.main === 'earningsAvailable') {
        updateData[mapping.main] = (before as Record<string, unknown>)[mapping.main] as number + amount
      }
      if (mapping.extra === 'consumeBalance') {
        updateData.consumeBalance = before.consumeBalance + amount * extraSign
      }

      if (Object.keys(updateData).length > 0) {
        await tx.user.update({
          where: { id: userId },
          data: updateData,
        })
      }

      const oldValue: Record<string, unknown> = {
        [mapping.main]: (before as Record<string, unknown>)[mapping.main] ?? 0,
      }
      if (mapping.extra) {
        oldValue[mapping.extra] = (before as Record<string, unknown>)[mapping.extra] ?? 0
      }

      const extraDesc = mapping.extra
        ? `，${getFieldLabel(mapping.extra)}${amount * extraSign > 0 ? '增加' : '扣减'} ¥${Math.abs(amount).toFixed(2)}`
        : ''
      const after4Field = {
        consumeBalance: before.consumeBalance + (mapping.extra === 'consumeBalance' ? amount * extraSign : 0),
        earningsAvailable: before.earningsAvailable + (mapping.main === 'earningsAvailable' ? amount : 0),
        earningsPending: before.earningsPending,
        earningsVoided: before.earningsVoided,
      }

      await tx.balanceRecord.create({
        data: {
          userId,
          type: adjustType,
          amount,
          balance: newBalance,
          frozenBalance: newFrozenBalance,
          sourceType: 'admin',
          sourceId: adminId,
          description: `管理员调账：${mapping.label}${amount > 0 ? '增加' : '扣减'} ¥${Math.abs(amount).toFixed(2)}${extraDesc}，原因：${reason}${format4FieldDelta(before, after4Field)}`,
        },
      })

      const updated = await tx.user.findUnique({ where: { id: userId } })
      if (!updated) throw new Error('用户更新后查询失败')
      return { updated, oldValue, mapping }
    })
  }
}
