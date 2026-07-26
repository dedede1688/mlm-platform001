import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { logger } from '@/lib/logger'
import { UserService } from '@/lib/services/user.service'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    }

    const data = await UserService.getUserDashboard(auth.userId)

    return NextResponse.json({ success: true, data })
  } catch (err) {
    logger.error('[dashboard]', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
