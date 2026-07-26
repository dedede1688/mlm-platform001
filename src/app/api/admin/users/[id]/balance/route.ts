import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { logOperation } from '@/lib/utils/operation-log'
import { invalidateCache } from '@/lib/utils/stats-cache'
import { checkRateLimit, getClientIP, rateLimitResponse } from '@/lib/utils/rate-limit'
import { BalanceService } from '@/lib/services/balance.service'
import { OrderNotificationService } from '@/lib/services/order-notification.service'
import { logger } from '@/lib/logger'

const VALID_TYPES = ['balance', 'frozenBalance', 'recharge', 'consume_void', 'earnings_add', 'earnings_void'] as const
type AdjustType = typeof VALID_TYPES[number]

const TYPE_LABEL_MAP: Record<AdjustType, string> = {
  balance: '\u4f59\u989d',
  frozenBalance: '\u51bb\u7ed3\u4f59\u989d',
  recharge: '\u4f59\u989d/\u6d88\u8d39\u4f59\u989d',
  consume_void: '\u4f59\u989d/\u6d88\u8d39\u4f59\u989d',
  earnings_add: '\u53ef\u63d0\u73b0\u6536\u76ca',
  earnings_void: '\u7d2f\u8ba1\u4f5c\u5e9f',
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    invalidateCache('admin-stats')

    const clientIP = getClientIP(request)
    const ipLimitResult = await checkRateLimit(`balance-adjust:ip:${clientIP}`, 10, 60 * 1000)
    if (!ipLimitResult.allowed) {
      return rateLimitResponse('\u8c03\u8d26\u8bf7\u6c42\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5', ipLimitResult.resetIn)
    }

    const { user: admin, error: authError } = await verifyPermission(
      request, ['finance_admin', 'super_admin']
    )
    if (authError || !admin) return authError!

    const { id } = await params
    const body = await request.json()
    const { type, amount, reason } = body

    if (!type || !VALID_TYPES.includes(type as AdjustType)) {
      return NextResponse.json(
        { success: false, message: `type \u5fc5\u987b\u4e3a ${VALID_TYPES.join(' / ')}` },
        { status: 400 }
      )
    }

    const adjustType: AdjustType = type as AdjustType

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount === 0) {
      return NextResponse.json(
        { success: false, message: 'amount \u5fc5\u987b\u4e3a\u975e\u96f6\u6709\u9650\u6570\u5b57' },
        { status: 400 }
      )
    }

    if (adjustType === 'earnings_void' && amount <= 0) {
      return NextResponse.json(
        { success: false, message: '\u4f5c\u5e9f\u6536\u76ca\u91d1\u989d\u5fc5\u987b\u4e3a\u6b63\u6570' },
        { status: 400 }
      )
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      return NextResponse.json(
        { success: false, message: '\u539f\u56e0\u81f3\u5c11 5 \u4e2a\u5b57' },
        { status: 400 }
      )
    }

    const result = await BalanceService.adjustBalance({
      userId: id,
      adminId: admin.id,
      type,
      amount,
      reason: reason.trim(),
    })

    if (!result.updated) {
      return NextResponse.json(
        { success: false, message: '\u66f4\u65b0\u540e\u67e5\u8be2\u7528\u6237\u5931\u8d25' },
        { status: 500 }
      )
    }

    const fieldLabel = TYPE_LABEL_MAP[adjustType] || result.mapping.label

    await logOperation({
      userId: admin.id,
      action: 'UPDATE',
      module: 'user',
      targetId: id,
      oldValue: result.oldValue,
      newValue: adjustType === 'earnings_void'
        ? { earningsAvailable: result.updated.earningsAvailable, earningsVoided: result.updated.earningsVoided }
        : { [result.mapping.main]: result.updated[result.mapping.main as keyof typeof result.updated] },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    if (adjustType === 'earnings_void') {
      await OrderNotificationService.notifyEarningsVoid({
        userId: id,
        amount,
        earningsAvailable: result.updated.earningsAvailable,
        earningsVoided: result.updated.earningsVoided,
        reason: reason.trim(),
        operatorId: admin.id,
        balanceRecordId: result.balanceRecordId!,
      }).catch((err) => {
        logger.error('[v006 notifyEarningsVoid route catch]', { error: String(err) })
      })
    } else {
      await OrderNotificationService.notifyBalanceChange({
        userId: id,
        adjustType: type as string,
        amount,
        newBalance: result.updated.balance,
        reason: reason.trim(),
        operatorId: admin.id,
      })
    }

    const actionLabel = amount > 0 ? '\u589e\u52a0' : '\u6263\u51cf'
    logger.info(
      `[BalanceAdjust] \u7528\u6237 ${id} \u7684${fieldLabel}\u5df2${actionLabel} \u00a5${Math.abs(amount).toFixed(2)}\uff0c\u539f\u56e0\uff1a${reason}`
    )

    if (adjustType === 'earnings_void') {
      return NextResponse.json({
        success: true,
        data: {
          earningsAvailable: result.updated.earningsAvailable,
          earningsVoided: result.updated.earningsVoided,
        },
        message: `\u6536\u76ca\u4f5c\u5e9f\u6210\u529f\uff1a\u53ef\u7528\u6536\u76ca\u51cf\u5c11 \u00a5${amount.toFixed(2)}\uff0c\u7d2f\u8ba1\u4f5c\u5e9f \u00a5${result.updated.earningsVoided.toFixed(2)}`,
      })
    }

    const responseData: Record<string, number> = {
      [result.mapping.main]: result.updated[result.mapping.main as keyof typeof result.updated] as number,
    }
    if (result.mapping.extra) {
      responseData[result.mapping.extra] = (result.updated as Record<string, unknown>)[result.mapping.extra] as number
    }

    return NextResponse.json({
      success: true,
      data: responseData,
      message: `\u8d44\u91d1\u8c03\u6574\u6210\u529f\uff1a${fieldLabel}${actionLabel} \u00a5${Math.abs(amount).toFixed(2)}`,
    })
  } catch (error) {
    logger.error('Adjust balance error:', error)
    const message = error instanceof Error ? error.message : '\u8d44\u91d1\u8c03\u6574\u5931\u8d25'
    const isBusinessError = message === '\u53ef\u7528\u6536\u76ca\u4e0d\u8db3'
    return NextResponse.json(
      { success: false, message },
      { status: isBusinessError ? 400 : 500 }
    )
  }
}
