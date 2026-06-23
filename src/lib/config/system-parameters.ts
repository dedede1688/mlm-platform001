import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export type SystemParameterKey =
  | 'auto_confirm_days' | 'earnings_hold_hours'
  | 'refund_window_days' | 'dividend_period_minutes'

export interface SystemParameterDef {
  key: SystemParameterKey; defaultValue: number; min: number; max: number
  description: string; unit: string
}

export const SYSTEM_PARAMETERS: Record<SystemParameterKey, SystemParameterDef> = {
  auto_confirm_days: { key: 'auto_confirm_days', defaultValue: 7, min: 0.0007, max: 30, description: '自动确认收货时间（发货后多久自动完成）', unit: 'days' },
  earnings_hold_hours: { key: 'earnings_hold_hours', defaultValue: 24, min: 0, max: 168, description: '收益到账缓冲期（确认收货后多久可提现）', unit: 'hours' },
  refund_window_days: { key: 'refund_window_days', defaultValue: 7, min: 0, max: 30, description: '可申请退款时间窗口（发货后多久内可退款）', unit: 'days' },
  dividend_period_minutes: { key: 'dividend_period_minutes', defaultValue: 1440, min: 1, max: 10080, description: '分红结算周期（订单入池后多久结算）', unit: 'minutes' },
}

let cache: Record<string, { value: number; time: number }> = {}
const CACHE_TTL = 60_000

export async function getSystemParameter(key: SystemParameterKey): Promise<number> {
  const c = cache[key]
  if (c && Date.now() - c.time < CACHE_TTL) return c.value
  const row = await prisma.systemConfig.findUnique({ where: { key } })
  const def = SYSTEM_PARAMETERS[key]
  let v = row ? Number(row.value) : def.defaultValue
  if (isNaN(v)) v = def.defaultValue
  cache[key] = { value: v, time: Date.now() }
  return v
}

export async function setSystemParameter(key: SystemParameterKey, value: number, adminId: string): Promise<void> {
  const def = SYSTEM_PARAMETERS[key]
  if (value < def.min || value > def.max) throw new Error(`${key} 必须在 ${def.min} - ${def.max} 之间`)
  await prisma.$transaction(async (tx) => {
    await tx.systemConfig.upsert({
      where: { key },
      create: { key, value: String(value), description: def.description },
      update: { value: String(value), description: def.description },
    })
    await tx.operationLog.create({
      data: {
        userId: adminId, action: 'UPDATE', module: 'system_config', targetId: key,
        oldValue: { value: cache[key]?.value }, newValue: { value },
        ip: null, userAgent: null,
      },
    })
  })
  delete cache[key]
  logger.info(`系统配置更新: ${key} = ${value}`)
}

export async function getAllSystemParameters(): Promise<Array<{ key: SystemParameterKey; value: number; def: SystemParameterDef }>> {
  const keys = Object.keys(SYSTEM_PARAMETERS) as SystemParameterKey[]
  const values = await Promise.all(keys.map(k => getSystemParameter(k)))
  return keys.map((k, i) => ({ key: k, value: values[i], def: SYSTEM_PARAMETERS[k] }))
}