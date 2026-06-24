import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { NotificationService } from '@/lib/services/notification.service'

export async function GET(request: NextRequest) {
  try {
    const authUser = await verifyToken(request)
    if (!authUser) {
      return NextResponse.json({ success: false, message: '未登录' }, { status: 401 })
    }
    const count = await NotificationService.getUnreadCount(authUser.userId)
    return NextResponse.json({ success: true, data: { count } })
  } catch (error) {
    console.error('[v46.8 unread-count] error:', error)
    return NextResponse.json({ success: false, message: '获取未读数失败' }, { status: 500 })
  }
}
