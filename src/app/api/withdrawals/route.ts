import { NextRequest, NextResponse } from 'next/server'
import { WithdrawalService } from '@/lib/services/withdrawal.service'
import { UserService } from '@/lib/services/user.service'
import { verifyToken } from '@/lib/utils/auth'
import { verifyPaymentPassword, checkPaymentPasswordLock, incrementFailedAttempt, resetPaymentPasswordLock, PAYMENT_LOCK_THRESHOLD } from '@/lib/auth/payment-password'
import { logger } from '@/lib/logger'


export async function GET(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const result = await WithdrawalService.getUserWithdrawals(auth.userId, page, limit)

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error) {
    logger.error('Get withdrawals error:', error)
    return NextResponse.json(
      { error: '获取提现记录失败' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      )
    }

    const { amount, paymentMethod, accountNumber, accountName, bankName, paymentPassword } = await request.json()

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: '提现金额必须大于0' },
        { status: 400 }
      )
    }

    if (!paymentPassword) {
      return NextResponse.json(
        { error: '请输入支付密码' },
        { status: 400 }
      )
    }

    const paymentPasswordHash = await UserService.getPaymentPasswordHash(auth.userId)
    if (!paymentPasswordHash) {
      return NextResponse.json(
        { error: '请先设置支付密码' },
        { status: 400 }
      )
    }

    const lockStatus = await checkPaymentPasswordLock(auth.userId)
    if (lockStatus.locked) {
      return NextResponse.json(
        { error: `支付密码已锁定，请${lockStatus.remainingMinutes}分钟后再试` },
        { status: 423 }
      )
    }

    const isValid = await verifyPaymentPassword(paymentPassword, paymentPasswordHash)
    if (!isValid) {
      const result = await incrementFailedAttempt(auth.userId)
      if (result.locked) {
        return NextResponse.json(
          { error: '支付密码已锁定，请15分钟后再试' },
          { status: 423 }
        )
      }
      const remaining = PAYMENT_LOCK_THRESHOLD - result.attempts
      return NextResponse.json(
        { error: `支付密码错误，剩余${remaining}次机会` },
        { status: 401 }
      )
    }

    await resetPaymentPasswordLock(auth.userId)

    const withdrawal = await WithdrawalService.createWithdrawal(auth.userId, {
      amount,
      paymentMethod,
      accountNumber,
      accountName,
      bankName,
})

    return NextResponse.json({
      success: true,
      data: withdrawal,
    })
  } catch (error: unknown) {
    logger.error('Create withdrawal error:', error)
    const message = error instanceof Error ? error.message : '创建提现申请失败'
    return NextResponse.json(
      { error: message },
      { status: 400 }
    )
  }
}
