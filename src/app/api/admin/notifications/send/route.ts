import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { NotificationService } from '@/lib/services/notification.service'
import { UserService } from '@/lib/services/user.service'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError || !admin) return authError!
    const body = await request.json()
    const { type, userIds, content, subject } = body
    if (!type || !['general', 'announcement'].includes(type)) {
      return NextResponse.json({ success: false, error: '类型必须为 general 或 announcement' }, { status: 400 })
    }
    if (!content) return NextResponse.json({ success: false, error: '内容不能为空' }, { status: 400 })
    if (type === 'general' && (!userIds || !Array.isArray(userIds) || userIds.length === 0)) {
      return NextResponse.json({ success: false, error: '通用通知必须指定至少一个收件人' }, { status: 400 })
    }
    const validateIds = type === 'announcement' ? [] : userIds
    if (validateIds.length > 0) {
      const { invalidIds } = await UserService.validateUserIds(validateIds)
      if (invalidIds.length > 0) {
        return NextResponse.json({
          success: false,
          error: `收件人 userId 不存在（${invalidIds.length} 个）：${invalidIds.slice(0, 3).join(', ')}${invalidIds.length > 3 ? '...' : ''}。请到会员管理页面查看真实 UUID。`,
        }, { status: 400 })
      }
    }
    const result = await NotificationService.sendNotifications({
      type, senderId: admin.id, content, subject,
      userIds: type === 'general' ? userIds : undefined,
      isAnnouncement: type === 'announcement',
    })
    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    logger.error('发送通知失败:', error)
    return NextResponse.json({ success: false, error: '发送通知失败' }, { status: 500 })
  }
}
