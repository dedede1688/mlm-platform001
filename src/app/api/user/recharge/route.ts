import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { RechargeService } from '@/lib/services/recharge.service'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const result = await RechargeService.getUserRechargeRequests(auth.userId, page, limit)

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('Get recharge requests error:', error)
    return NextResponse.json({ error: '获取充值申请记录失败' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { amount, paymentMethod, paymentProofUrl, remark } = await request.json()

    const recharge = await RechargeService.createRechargeRequest(auth.userId, {
      amount,
      paymentMethod,
      paymentProofUrl,
      remark,
    })

    return NextResponse.json({ success: true, data: recharge })
  } catch (error: any) {
    console.error('Create recharge request error:', error)
    const message = error?.message || '创建充值申请失败'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
