import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { RechargeSettingsService, UpdateRechargeSettingsInput, RechargeSettingsValidationError } from '@/lib/services/recharge-settings.service'
import { logOperation } from '@/lib/utils/operation-log'
import { logger } from '@/lib/logger'

const ALLOWED_ROLES = ['super_admin', 'finance_admin']

/**
 * 后台充值设置接口（第一包底座）
 * - GET 读取当前配置
 * - PUT 保存配置（白名单 + 严格校验由 service 保证）
 * - 双重鉴权：middleware pathRoleMap + 路由内 verifyPermission 查库确认角色
 *
 * 修复二：PUT 严格区分 400（业务校验错误）vs 500（数据库/事务/未知异常）：
 * - RechargeSettingsValidationError → 400 + 具体中文文案
 * - 其他错误（数据库/事务/未知）→ 500 + 通用文案 + logger.error + 不泄露内部信息
 */
export async function GET(request: NextRequest) {
  const { user: admin, error } = await verifyPermission(request, ALLOWED_ROLES)
  if (error || !admin) return error!

  try {
    const settings = await RechargeSettingsService.getSettings()
    return NextResponse.json({ success: true, data: settings })
  } catch (cause) {
    console.error('Get recharge settings error:', cause)
    return NextResponse.json({ success: false, error: '获取充值设置失败' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const { user: admin, error } = await verifyPermission(request, ALLOWED_ROLES)
  if (error || !admin) return error!

  try {
    // 接口层显式构造白名单输入，忽略任何额外字段
    const body = await request.json()
    const input: UpdateRechargeSettingsInput = {
      enabled: body.enabled,
      qrCodeUrl: body.qrCodeUrl,
      qrCodeLabel: body.qrCodeLabel,
      payeeName: body.payeeName,
      minAmount: body.minAmount,
      maxAmount: body.maxAmount,
      instruction: body.instruction,
      contactPhone: body.contactPhone,
      serviceTime: body.serviceTime,
    }

    const result = await RechargeSettingsService.updateSettings(input)

    // 操作日志：logOperation 内部独立 try-catch，不阻塞保存结果
    const xff = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    await logOperation({
      userId: admin.id,
      action: 'UPDATE',
      module: 'finance',
      targetId: 'recharge-settings',
      oldValue: result.previous as unknown as Record<string, unknown>,
      newValue: result.current as unknown as Record<string, unknown>,
      ip: xff || request.headers.get('x-real-ip') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    return NextResponse.json({ success: true, data: result.current })
  } catch (cause: unknown) {
    // 业务校验错误（可预期参数错误）→ 400 + 具体中文文案
    if (cause instanceof RechargeSettingsValidationError) {
      return NextResponse.json(
        { success: false, error: cause.message },
        { status: 400 }
      )
    }

    // 数据库 / 事务 / 未知异常 → 500 + 通用文案（不暴露内部信息）
    // 必须记录错误（控制台 + 结构化 logger）
    console.error('Update recharge settings error:', cause)
    logger.error('保存充值设置失败', {
      error: cause instanceof Error ? cause.message : String(cause),
      code:
        typeof cause === 'object' && cause !== null && 'code' in cause
          ? String((cause as { code?: unknown }).code || '')
          : undefined,
      meta:
        typeof cause === 'object' && cause !== null && 'meta' in cause
          ? (cause as { meta?: unknown }).meta
          : undefined,
    })

    return NextResponse.json(
      { success: false, error: '保存充值设置失败' },
      { status: 500 }
    )
  }
}
