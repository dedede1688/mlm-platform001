import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { RechargeService } from '@/lib/services/recharge.service'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const settings = await RechargeService.getRechargeSettings()

    return NextResponse.json({ success: true, data: settings })
  } catch (error) {
    console.error('Get recharge settings error:', error)
    return NextResponse.json({ error: '获取充值设置失败' }, { status: 500 })
  }
}
