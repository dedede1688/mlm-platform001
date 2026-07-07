import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { RechargeService } from '@/lib/services/recharge.service'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id } = await params
    const recharge = await RechargeService.getUserRechargeRequestById(auth.userId, id)

    if (!recharge) {
      return NextResponse.json({ error: '充值申请记录不存在' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: recharge })
  } catch (error) {
    console.error('Get recharge request detail error:', error)
    return NextResponse.json({ error: '获取充值申请详情失败' }, { status: 500 })
  }
}
