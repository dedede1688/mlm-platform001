import { NextRequest, NextResponse } from 'next/server'
import { NotificationService } from '@/lib/services/notification.service'

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ success: false, message: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')))

    const result = await NotificationService.listMyNotifications(userId, page, limit)

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('Get notifications error:', error)
    return NextResponse.json({ success: false, message: '获取通知失败' }, { status: 500 })
  }
}