import { NextRequest, NextResponse } from 'next/server'
import { WithdrawalService } from '@/lib/services/withdrawal.service'
import { verifyToken } from '@/lib/utils/auth'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

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
    console.error('Get withdrawals error:', error)
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

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { paymentPasswordHash: true },
    })

    if (!user?.paymentPasswordHash) {
      return NextResponse.json(
        { error: '请先设置支付密码' },
        { status: 400 }
      )
    }

    const isValid = await bcrypt.compare(paymentPassword, user.paymentPasswordHash)
    if (!isValid) {
      return NextResponse.json(
        { error: '支付密码错误' },
        { status: 400 }
      )
    }

    const withdrawal = await WithdrawalService.createWithdrawal(auth.userId, {
      amount,
      paymentMethod,
      accountNumber,
      accountName,
      bankName,
      paymentPassword,
    })

    return NextResponse.json({
      success: true,
      data: withdrawal,
    })
  } catch (error: any) {
    console.error('Create withdrawal error:', error)
    const message = error?.message || '创建提现申请失败'
    return NextResponse.json(
      { error: message },
      { status: 400 }
    )
  }
}
