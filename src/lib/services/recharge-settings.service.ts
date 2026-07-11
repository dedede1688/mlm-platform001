import { prisma } from '@/lib/prisma'
import { getBusinessConfig, invalidateBusinessConfigCache } from '@/lib/config/business'

/**
 * 充值设置类型（第一包底座）
 * 复用现有 system_configs 表，不新增数据库表。
 */
export interface RechargeSettings {
  enabled: boolean
  qrCodeUrl?: string
  qrCodeLabel?: string
  payeeName?: string
  minAmount: number
  maxAmount: number
  instruction: string
  contactPhone?: string
  serviceTime?: string
}

export type UpdateRechargeSettingsInput = RechargeSettings

export interface RechargeSettingsUpdateResult {
  previous: RechargeSettings
  current: RechargeSettings
}

/**
 * 充值设置业务校验错误（修复一）
 * 用于区分"用户可预期参数错误"和"数据库/事务/未知异常"。
 * 路由层捕获此错误时返回 400 + 具体中文文案；
 * 其他错误（数据库/事务/未知）应原样向上抛出，路由层统一返回 500 + 通用文案。
 */
export class RechargeSettingsValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RechargeSettingsValidationError'
  }
}

// 固定的九个充值配置键白名单（plan 任务 1 步骤 3）
const RECHARGE_CONFIG = {
  enabled: { key: 'recharge.enabled', description: '充值功能是否启用' },
  qrCodeUrl: { key: 'recharge.qr_code_url', description: '充值二维码图片地址' },
  qrCodeLabel: { key: 'recharge.qr_code_label', description: '充值二维码说明' },
  payeeName: { key: 'recharge.payee_name', description: '充值收款人名称' },
  minAmount: { key: 'recharge.min_amount', description: '最低充值金额' },
  maxAmount: { key: 'recharge.max_amount', description: '最高充值金额' },
  instruction: { key: 'recharge.instruction', description: '充值说明' },
  contactPhone: { key: 'recharge.contact_phone', description: '充值客服电话' },
  serviceTime: { key: 'recharge.service_time', description: '充值服务时间' },
} as const

const DEFAULT_INSTRUCTION = '请扫码完成付款，返回本页面填写充值金额并上传付款成功截图，等待后台审核入账。'

// 规范化：可选字符串去首尾空格；空字符串 / 纯空格 归一为 undefined
function trimOptional(value: string | undefined): string | undefined {
  const trimmed = typeof value === 'string' ? value.trim() : undefined
  return trimmed || undefined
}

// 规范化 + 严格校验（修复一：失败抛 RechargeSettingsValidationError）
function validateSettings(input: UpdateRechargeSettingsInput): RechargeSettings {
  const normalized: RechargeSettings = {
    enabled: input.enabled === true,
    qrCodeUrl: trimOptional(input.qrCodeUrl),
    qrCodeLabel: trimOptional(input.qrCodeLabel),
    payeeName: trimOptional(input.payeeName),
    minAmount: input.minAmount,
    maxAmount: input.maxAmount,
    instruction: typeof input.instruction === 'string' ? input.instruction.trim() : '',
    contactPhone: trimOptional(input.contactPhone),
    serviceTime: trimOptional(input.serviceTime),
  }

  // 启用充值时必须有有效二维码
  if (normalized.enabled && !normalized.qrCodeUrl) {
    throw new RechargeSettingsValidationError('启用充值前请先上传充值二维码')
  }
  // 二维码必须是 https 地址
  if (normalized.qrCodeUrl && !/^https:\/\//i.test(normalized.qrCodeUrl)) {
    throw new RechargeSettingsValidationError('充值二维码必须是已上传成功的 https 图片地址')
  }
  // 金额必须有限正数
  if (!Number.isFinite(normalized.minAmount) || normalized.minAmount <= 0) {
    throw new RechargeSettingsValidationError('最低充值金额必须是大于 0 的有效数字')
  }
  if (!Number.isFinite(normalized.maxAmount) || normalized.maxAmount <= 0) {
    throw new RechargeSettingsValidationError('最高充值金额必须是大于 0 的有效数字')
  }
  // 最高金额必须 >= 最低金额
  if (normalized.maxAmount < normalized.minAmount) {
    throw new RechargeSettingsValidationError('最高充值金额不能低于最低充值金额')
  }
  // 说明不能为空
  if (!normalized.instruction) {
    throw new RechargeSettingsValidationError('充值说明不能为空')
  }

  return normalized
}

// 映射 normalized 字段 → 实际保存到 systemConfig 的字符串值
function toStoredValue(normalized: RechargeSettings): Record<string, string> {
  return {
    [RECHARGE_CONFIG.enabled.key]: String(normalized.enabled),
    [RECHARGE_CONFIG.qrCodeUrl.key]: normalized.qrCodeUrl || '',
    [RECHARGE_CONFIG.qrCodeLabel.key]: normalized.qrCodeLabel || '',
    [RECHARGE_CONFIG.payeeName.key]: normalized.payeeName || '',
    [RECHARGE_CONFIG.minAmount.key]: String(normalized.minAmount),
    [RECHARGE_CONFIG.maxAmount.key]: String(normalized.maxAmount),
    [RECHARGE_CONFIG.instruction.key]: normalized.instruction,
    [RECHARGE_CONFIG.contactPhone.key]: normalized.contactPhone || '',
    [RECHARGE_CONFIG.serviceTime.key]: normalized.serviceTime || '',
  }
}

export class RechargeSettingsService {
  /**
   * 读取充值设置（委托 getBusinessConfig，复用现有缓存）
   * 修复四：返回前对可选字符串字段统一 trimOptional（空字符串/纯空格 → undefined）
   */
  static async getSettings(): Promise<RechargeSettings> {
    const [enabled, qrCodeUrl, qrCodeLabel, payeeName, minAmount, maxAmount, instruction, contactPhone, serviceTime] = await Promise.all([
      getBusinessConfig<boolean>(RECHARGE_CONFIG.enabled.key, false),
      getBusinessConfig<string | undefined>(RECHARGE_CONFIG.qrCodeUrl.key, undefined),
      getBusinessConfig<string | undefined>(RECHARGE_CONFIG.qrCodeLabel.key, '平台充值二维码'),
      getBusinessConfig<string | undefined>(RECHARGE_CONFIG.payeeName.key, undefined),
      getBusinessConfig<number>(RECHARGE_CONFIG.minAmount.key, 1),
      getBusinessConfig<number>(RECHARGE_CONFIG.maxAmount.key, 50000),
      getBusinessConfig<string>(RECHARGE_CONFIG.instruction.key, DEFAULT_INSTRUCTION),
      getBusinessConfig<string | undefined>(RECHARGE_CONFIG.contactPhone.key, undefined),
      getBusinessConfig<string | undefined>(RECHARGE_CONFIG.serviceTime.key, undefined),
    ])

    return {
      enabled,
      qrCodeUrl: trimOptional(qrCodeUrl),
      qrCodeLabel: trimOptional(qrCodeLabel),
      payeeName: trimOptional(payeeName),
      minAmount,
      maxAmount,
      instruction: typeof instruction === 'string' ? instruction : (instruction || DEFAULT_INSTRUCTION),
      contactPhone: trimOptional(contactPhone),
      serviceTime: trimOptional(serviceTime),
    }
  }

  /**
   * 保存充值设置：
   * 1) 取修改前快照
   * 2) 校验 + 规范化（修复一：失败抛 RechargeSettingsValidationError）
   * 3) 在事务内对固定 9 个键执行 upsert
   * 4) 事务成功后立即清除配置缓存（修复三：事务失败时**不清理**缓存）
   * 5) 返回 { previous, current }
   *
   * 重要：数据库/事务异常**不**包装成业务校验错误，必须原样向上抛出，
   * 由路由层统一返回 500 + 通用文案 + logger.error 记录。
   */
  static async updateSettings(input: UpdateRechargeSettingsInput): Promise<RechargeSettingsUpdateResult> {
    const previous = await RechargeSettingsService.getSettings()
    const normalized = validateSettings(input)
    const stored = toStoredValue(normalized)

    await prisma.$transaction(async (tx) => {
      const configEntries = Object.values(RECHARGE_CONFIG)
      for (const { key, description } of configEntries) {
        await tx.systemConfig.upsert({
          where: { key },
          create: { key, value: stored[key], description },
          update: { value: stored[key] },
        })
      }
    })

    // 事务成功后才清除业务配置缓存（事务失败时不清，避免缓存与数据库不一致）
    invalidateBusinessConfigCache()

    return { previous, current: normalized }
  }
}
