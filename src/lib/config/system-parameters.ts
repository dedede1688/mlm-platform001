import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

// v50 C: 参数类型扩展：支持 number + boolean
export type ParameterType = 'number' | 'boolean'

export type SystemParameterKey =
  // 原有 4 项时间参数
  | 'auto_confirm_days' | 'earnings_hold_hours'
  | 'refund_window_days' | 'dividend_period_minutes'
  // 业务参数 - 奖励
  | 'reward.referral_rate' | 'reward.brand_bonus_rate'
  // 业务参数 - 分红
  | 'dividend.director.rate' | 'dividend.manager.rate'
  | 'dividend.supervisor.rate' | 'dividend.president.rate' | 'dividend.board.rate'
  | 'dividend.director.include_upstream' | 'dividend.manager.include_upstream'
  | 'dividend.supervisor.include_upstream' | 'dividend.president.include_upstream'
  | 'dividend.board.include_upstream'
  // 业务参数 - 升级
  | 'upgrade.distributor.box_count' | 'upgrade.points_per_box'
  | 'upgrade.daily_unlock_rate'
  | 'upgrade.director.sales_amount' | 'upgrade.manager.sales_amount'
  | 'upgrade.supervisor.sales_amount' | 'upgrade.president.sales_amount'
  | 'upgrade.board.sales_amount'
  // 功能开关
  | 'feature.points_transfer_enabled' | 'points.transfer_fee_percent'
  // 提现
  | 'withdrawal.min_amount' | 'withdrawal.max_amount'
  | 'withdrawal.daily_limit' | 'withdrawal.fee_percent'

export interface SystemParameterDef {
  key: SystemParameterKey
  type: ParameterType
  defaultValue: number | boolean
  min?: number       // boolean 无 min/max
  max?: number
  description: string
  unit: string
  group: ParameterGroup
}

export type ParameterGroup = 'time' | 'reward' | 'dividend' | 'upgrade' | 'feature' | 'points' | 'withdrawal'

export const GROUP_LABELS: Record<ParameterGroup, string> = {
  time: '⏰ 时间参数',
  reward: '🎁 奖励配置',
  dividend: '💰 分红配置',
  upgrade: '⬆️ 升级门槛',
  feature: '🔧 功能开关',
  points: '🪙 积分设置',
  withdrawal: '💳 提现设置',
}

export const SYSTEM_PARAMETERS: Record<SystemParameterKey, SystemParameterDef> = {
  // ===== 时间参数（原有 4 项）=====
  auto_confirm_days: {
    key: 'auto_confirm_days', type: 'number', defaultValue: 7,
    min: 0.0007, max: 30, unit: 'days', group: 'time',
    description: '自动确认收货时间（发货后多久自动完成）',
  },
  earnings_hold_hours: {
    key: 'earnings_hold_hours', type: 'number', defaultValue: 24,
    min: 0, max: 168, unit: 'hours', group: 'time',
    description: '收益到账缓冲期（确认收货后多久可提现）',
  },
  refund_window_days: {
    key: 'refund_window_days', type: 'number', defaultValue: 7,
    min: 0, max: 30, unit: 'days', group: 'time',
    description: '可申请退款时间窗口（发货后多久内可退款）',
  },
  dividend_period_minutes: {
    key: 'dividend_period_minutes', type: 'number', defaultValue: 1440,
    min: 1, max: 10080, unit: 'minutes', group: 'time',
    description: '分红结算周期（订单入池后多久结算）',
  },

  // ===== 奖励配置（2 项）=====
  'reward.referral_rate': {
    key: 'reward.referral_rate', type: 'number', defaultValue: 0.20,
    min: 0.01, max: 0.50, unit: '比例', group: 'reward',
    description: '直推奖比例',
  },
  'reward.brand_bonus_rate': {
    key: 'reward.brand_bonus_rate', type: 'number', defaultValue: 0.20,
    min: 0.01, max: 0.50, unit: '比例', group: 'reward',
    description: '品牌管理奖比例',
  },

  // ===== 分红配置（10 项：5 比例 + 5 开关）=====
  'dividend.director.rate': {
    key: 'dividend.director.rate', type: 'number', defaultValue: 0.05,
    min: 0, max: 0.20, unit: '比例', group: 'dividend',
    description: '分红-主任池比例',
  },
  'dividend.manager.rate': {
    key: 'dividend.manager.rate', type: 'number', defaultValue: 0.05,
    min: 0, max: 0.20, unit: '比例', group: 'dividend',
    description: '分红-经理池比例',
  },
  'dividend.supervisor.rate': {
    key: 'dividend.supervisor.rate', type: 'number', defaultValue: 0.05,
    min: 0, max: 0.20, unit: '比例', group: 'dividend',
    description: '分红-总监池比例',
  },
  'dividend.president.rate': {
    key: 'dividend.president.rate', type: 'number', defaultValue: 0.05,
    min: 0, max: 0.20, unit: '比例', group: 'dividend',
    description: '分红-总裁池比例',
  },
  'dividend.board.rate': {
    key: 'dividend.board.rate', type: 'number', defaultValue: 0.05,
    min: 0, max: 0.20, unit: '比例', group: 'dividend',
    description: '分红-董事池比例',
  },
  'dividend.director.include_upstream': {
    key: 'dividend.director.include_upstream', type: 'boolean', defaultValue: false,
    unit: '-', group: 'dividend',
    description: '主任池"包含上级"开关',
  },
  'dividend.manager.include_upstream': {
    key: 'dividend.manager.include_upstream', type: 'boolean', defaultValue: false,
    unit: '-', group: 'dividend',
    description: '经理池"包含上级"开关',
  },
  'dividend.supervisor.include_upstream': {
    key: 'dividend.supervisor.include_upstream', type: 'boolean', defaultValue: false,
    unit: '-', group: 'dividend',
    description: '总监池"包含上级"开关',
  },
  'dividend.president.include_upstream': {
    key: 'dividend.president.include_upstream', type: 'boolean', defaultValue: false,
    unit: '-', group: 'dividend',
    description: '总裁池"包含上级"开关',
  },
  'dividend.board.include_upstream': {
    key: 'dividend.board.include_upstream', type: 'boolean', defaultValue: false,
    unit: '-', group: 'dividend',
    description: '董事池"包含上级"开关',
  },

  // ===== 升级门槛（8 项）=====
  'upgrade.distributor.box_count': {
    key: 'upgrade.distributor.box_count', type: 'number', defaultValue: 10,
    min: 1, max: 100, unit: '箱', group: 'upgrade',
    description: '经销商升级门槛（箱数）',
  },
  'upgrade.points_per_box': {
    key: 'upgrade.points_per_box', type: 'number', defaultValue: 500,
    min: 100, max: 1000, unit: '积分', group: 'upgrade',
    description: '每箱积分',
  },
  'upgrade.daily_unlock_rate': {
    key: 'upgrade.daily_unlock_rate', type: 'number', defaultValue: 0.01,
    min: 0.001, max: 0.10, unit: '比例', group: 'upgrade',
    description: '积分每天释放比例',
  },
  'upgrade.director.sales_amount': {
    key: 'upgrade.director.sales_amount', type: 'number', defaultValue: 50000,
    min: 1000, max: 1000000, unit: '元', group: 'upgrade',
    description: '主任升级销售额',
  },
  'upgrade.manager.sales_amount': {
    key: 'upgrade.manager.sales_amount', type: 'number', defaultValue: 100000,
    min: 1000, max: 5000000, unit: '元', group: 'upgrade',
    description: '经理升级销售额',
  },
  'upgrade.supervisor.sales_amount': {
    key: 'upgrade.supervisor.sales_amount', type: 'number', defaultValue: 200000,
    min: 1000, max: 10000000, unit: '元', group: 'upgrade',
    description: '总监升级销售额',
  },
  'upgrade.president.sales_amount': {
    key: 'upgrade.president.sales_amount', type: 'number', defaultValue: 500000,
    min: 1000, max: 50000000, unit: '元', group: 'upgrade',
    description: '总裁升级销售额',
  },
  'upgrade.board.sales_amount': {
    key: 'upgrade.board.sales_amount', type: 'number', defaultValue: 1000000,
    min: 1000, max: 100000000, unit: '元', group: 'upgrade',
    description: '董事升级销售额',
  },

  // ===== 功能开关（2 项）=====
  'feature.points_transfer_enabled': {
    key: 'feature.points_transfer_enabled', type: 'boolean', defaultValue: true,
    unit: '-', group: 'feature',
    description: '积分转赠功能开关',
  },
  'points.transfer_fee_percent': {
    key: 'points.transfer_fee_percent', type: 'number', defaultValue: 10,
    min: 0, max: 50, unit: '%', group: 'points',
    description: '积分转赠手续费',
  },

  // ===== 提现设置（4 项）=====
  'withdrawal.min_amount': {
    key: 'withdrawal.min_amount', type: 'number', defaultValue: 100,
    min: 1, max: 10000, unit: '元', group: 'withdrawal',
    description: '最低提现金额',
  },
  'withdrawal.max_amount': {
    key: 'withdrawal.max_amount', type: 'number', defaultValue: 50000,
    min: 100, max: 1000000, unit: '元', group: 'withdrawal',
    description: '单笔最高提现金额',
  },
  'withdrawal.daily_limit': {
    key: 'withdrawal.daily_limit', type: 'number', defaultValue: 3,
    min: 1, max: 20, unit: '次', group: 'withdrawal',
    description: '每日提现次数上限',
  },
  'withdrawal.fee_percent': {
    key: 'withdrawal.fee_percent', type: 'number', defaultValue: 0,
    min: 0, max: 20, unit: '%', group: 'withdrawal',
    description: '提现手续费',
  },
}

// 缓存类型：支持 number | boolean
interface CacheEntry {
  value: number | boolean
  time: number
}

const cache: Record<string, CacheEntry> = {}
const CACHE_TTL = 60_000

export async function getSystemParameter(key: SystemParameterKey): Promise<number | boolean> {
  const c = cache[key]
  if (c && Date.now() - c.time < CACHE_TTL) return c.value
  const row = await prisma.systemConfig.findUnique({ where: { key } })
  const def = SYSTEM_PARAMETERS[key]
  let v: number | boolean
  if (row) {
    v = def.type === 'boolean' ? row.value === 'true' : Number(row.value)
  } else {
    v = def.defaultValue
  }
  if (def.type === 'number' && isNaN(v as number)) v = def.defaultValue
  cache[key] = { value: v, time: Date.now() }
  return v
}

export async function setSystemParameter(
  key: SystemParameterKey,
  value: number | boolean,
  adminId: string
): Promise<void> {
  const def = SYSTEM_PARAMETERS[key]

  if (def.type === 'number') {
    const numValue = value as number
    if (def.min !== undefined && def.max !== undefined) {
      if (numValue < def.min || numValue > def.max) {
        throw new Error(`${key} 必须在 ${def.min} - ${def.max} 之间`)
      }
    }
    await prisma.$transaction(async (tx) => {
      await tx.systemConfig.upsert({
        where: { key },
        create: { key, value: String(numValue), description: def.description },
        update: { value: String(numValue), description: def.description },
      })
      await tx.operationLog.create({
        data: {
          userId: adminId, action: 'UPDATE', module: 'system_config', targetId: key,
          oldValue: { value: cache[key]?.value }, newValue: { value: numValue },
          ip: null, userAgent: null,
        },
      })
    })
  } else if (def.type === 'boolean') {
    const boolValue = value as boolean
    await prisma.$transaction(async (tx) => {
      await tx.systemConfig.upsert({
        where: { key },
        create: { key, value: String(boolValue), description: def.description },
        update: { value: String(boolValue), description: def.description },
      })
      await tx.operationLog.create({
        data: {
          userId: adminId, action: 'UPDATE', module: 'system_config', targetId: key,
          oldValue: { value: cache[key]?.value }, newValue: { value: boolValue },
          ip: null, userAgent: null,
        },
      })
    })
  }

  delete cache[key]
  logger.info(`系统配置更新: ${key} = ${value}`)
}

export async function getAllSystemParameters(): Promise<Array<{
  key: SystemParameterKey
  value: number | boolean
  def: SystemParameterDef
}>> {
  const keys = Object.keys(SYSTEM_PARAMETERS) as SystemParameterKey[]
  const values = await Promise.all(keys.map(k => getSystemParameter(k)))
  return keys.map((k, i) => ({ key: k, value: values[i], def: SYSTEM_PARAMETERS[k] }))
}
