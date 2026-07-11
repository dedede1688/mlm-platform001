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

    // 字段白名单：只返回用户需要看的字段，不暴露后台管理字段
    const safeRequests = result.requests.map((r) => ({
      id: r.id,
      amount: r.amount,
      paymentMethod: r.paymentMethod,
      paymentProofUrl: r.paymentProofUrl,
      status: r.status,
      rejectReason: r.rejectReason,
      reviewedAt: r.reviewedAt,
      approvedAt: r.approvedAt,
      createdAt: r.createdAt,
      remark: r.remark,
    }))

    return NextResponse.json({
      success: true,
      data: {
        requests: safeRequests,
        pagination: result.pagination,
      },
    })
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

    const { amount, paymentProofUrl, remark } = await request.json()

    const recharge = await RechargeService.createRechargeRequest(auth.userId, {
      amount,
      paymentProofUrl,
      remark,
    })

    // 字段白名单：与 GET 一致，不暴露后台管理字段
    const safeRecharge = {
      id: recharge.id,
      amount: recharge.amount,
      paymentMethod: recharge.paymentMethod,
      paymentProofUrl: recharge.paymentProofUrl,
      status: recharge.status,
      rejectReason: recharge.rejectReason,
      reviewedAt: recharge.reviewedAt,
      approvedAt: recharge.approvedAt,
      createdAt: recharge.createdAt,
      remark: recharge.remark,
    }

    return NextResponse.json({ success: true, data: safeRecharge })
  } catch (error: any) {
    console.error('Create recharge request error:', error)
    const message = error?.message || '创建充值申请失败'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
