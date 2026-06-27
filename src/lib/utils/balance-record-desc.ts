/**
 * v50 I: 生成 BalanceRecord.description 的 4 字段影响后缀
 * @param before 事务前 4 字段余额
 * @param after 事务后 4 字段余额
 * @returns 标准格式：「（消费余额 ±X，可提现 ±Y，待结算 ±Z，作废 ±W）」
 */
export function format4FieldDelta(
  before: { consumeBalance: number; earningsAvailable: number; earningsPending: number; earningsVoided: number },
  after: { consumeBalance: number; earningsAvailable: number; earningsPending: number; earningsVoided: number }
): string {
  const deltas: string[] = []

  const consumeDelta = round2(after.consumeBalance - before.consumeBalance)
  if (consumeDelta !== 0) deltas.push(`消费余额 ${formatDelta(consumeDelta)}`)

  const earningsAvailDelta = round2(after.earningsAvailable - before.earningsAvailable)
  if (earningsAvailDelta !== 0) deltas.push(`可提现 ${formatDelta(earningsAvailDelta)}`)

  const earningsPendingDelta = round2(after.earningsPending - before.earningsPending)
  if (earningsPendingDelta !== 0) deltas.push(`待结算 ${formatDelta(earningsPendingDelta)}`)

  const earningsVoidedDelta = round2(after.earningsVoided - before.earningsVoided)
  if (earningsVoidedDelta !== 0) deltas.push(`作废 ${formatDelta(earningsVoidedDelta)}`)

  return deltas.length > 0 ? `（${deltas.join('，')}）` : ''
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function formatDelta(n: number): string {
  return n > 0 ? `+¥${n.toFixed(2)}` : `-¥${Math.abs(n).toFixed(2)}`
}
