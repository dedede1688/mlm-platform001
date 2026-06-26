import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { NotificationService } from '@/lib/services/notification.service'

export async function GET(request: NextRequest) {
  try {
    // v46.10.2: 改用 verifyToken 从 JWT 拿 userId
    // (不再依赖 middleware 注入的 x-user-id，因为 middleware 只拦 /api/admin/*)
    const authUser = await verifyToken(request)
    if (!authUser) {
      return NextResponse.json({ success: false, message: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')))

    const result = await NotificationService.listMyNotifications(authUser.userId, page, limit)

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('Get notifications error:', error)
    return NextResponse.json({ success: false, message: '获取通知失败' }, { status: 500 })
  }
}