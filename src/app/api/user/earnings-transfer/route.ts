import { NextRequest } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { errorResponse, successResponse } from '@/lib/api-response'
import { logOperation } from '@/lib/utils/operation-log'
import { EarningsTransferService } from '@/lib/services/earnings-transfer.service'
import { OrderNotificationService } from '@/lib/services/order-notification.service'

/**
 * POST /api/user/earnings-transfer
 *
 * 用户把可用收益（earningsAvailable）转入购物余额（balance）
 *
 * body: { "amount": 100 }
 */
export async function POST(request: NextRequest) {
  try {
    // 1. 验证登录
    const auth = await verifyToken(request)
    if (!auth) {
      return errorResponse('未登录', 401)
    }

    // 2. 解析 amount
    const { amount } = await request.json()

    // 3. 调用 service
    const result = await EarningsTransferService.transferToBalance(auth.userId, amount)

    // 4. 写 OperationLog（route 层，失败不影响主流程）
    await logOperation({
      userId: auth.userId,
      action: 'TRANSFER',
      module: 'earnings',
      targetId: auth.userId,
      newValue: {
        amount: result.amount,
        balance: result.balance,
        earningsAvailable: result.earningsAvailable,
      },
    }).catch(() => {})

    // 5. 发通知（route 层，await + catch，失败不影响主流程）
    await OrderNotificationService.notifyEarningsTransferred({
      userId: result.userId,
      amount: result.amount,
      balance: result.balance,
      earningsAvailable: result.earningsAvailable,
    }).catch(() => {})

    // 6. 返回成功
    return successResponse({
      amount: result.amount,
      balance: result.balance,
      earningsAvailable: result.earningsAvailable,
    })
  } catch (error: any) {
    console.error('Earnings transfer error:', error)
    const message = error?.message || '收益转余额失败'
    const status =
      message === '未登录' ? 401 :
      message === '用户不存在' ? 404 :
      message === '可用收益不足' || message === '可用收益不足或状态已变更' ? 400 :
      message === '转入金额必须为有效数字且大于0' ? 400 :
      500
    return errorResponse(message, status)
  }
}
