import { NextRequest, NextResponse } from 'next/server'
import { NotificationService } from '@/lib/services/notification.service'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ success: false, message: '未登录' }, { status: 401 })
    }

    const { id } = await params
    const notification = await NotificationService.markAsRead(id, userId)

    return NextResponse.json({ success: true, data: notification, message: '已标记为已读' })
  } catch (error: any) {
    console.error('Mark notification read error:', error)
    const status = error.message === '通知不存在' ? 404
      : error.message === '无权操作' ? 403
      : 500
    return NextResponse.json({ success: false, message: error.message || '标记失败' }, { status })
  }
}