import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['admin', 'super_admin'])
    if (authError || !admin) return authError!

    const body = await request.json()
    const { type, userIds, content, subject } = body

    if (!type || !['general', 'announcement'].includes(type)) {
      return NextResponse.json({ success: false, error: '类型必须为 general 或 announcement' }, { status: 400 })
    }
    if (!content) {
      return NextResponse.json({ success: false, error: '内容不能为空' }, { status: 400 })
    }

    if (type === 'general' && (!userIds || !Array.isArray(userIds) || userIds.length === 0)) {
      return NextResponse.json({ success: false, error: '通用通知必须指定至少一个收件人' }, { status: 400 })
    }

    let targetUserIds: string[] = []

    if (type === 'announcement') {
      const allUsers = await prisma.user.findMany({ select: { id: true } })
      targetUserIds = allUsers.map((u) => u.id)
    } else {
      targetUserIds = userIds
    }

    // v46.9: 校验 userId 是否真实存在（防止传 "admin" 等昵称导致外键 500）
    if (targetUserIds.length > 0) {
      const existingUsers = await prisma.user.findMany({
        where: { id: { in: targetUserIds } },
        select: { id: true },
      })
      const existingIds = new Set(existingUsers.map((u) => u.id))
      const invalidIds = targetUserIds.filter((id) => !existingIds.has(id))
      if (invalidIds.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `收件人 userId 不存在（${invalidIds.length} 个）：${invalidIds.slice(0, 3).join(', ')}${invalidIds.length > 3 ? '...' : ''}。请到会员管理页面查看真实 UUID。`,
          },
          { status: 400 }
        )
      }
    }

    const template = await prisma.notificationTemplate.findUnique({
      where: { type_channel: { type, channel: 'in_app' } },
    })

    const finalSubject = subject ?? template?.subject ?? (type === 'general' ? '通用通知' : '系统公告')

    const batch = await prisma.notificationBatch.create({
      data: {
        type,
        title: finalSubject,
        content,
        templateType: type,
        recipientCount: targetUserIds.length,
        senderId: admin.id,
      },
    })

    const data = targetUserIds.map((userId) => ({
      userId,
      type,
      title: finalSubject,
      content,
      sourceType: type,
      sourceId: null,
      batchId: batch.id,
      senderId: admin.id,
    }))

    const result = await prisma.notification.createMany({ data })

    return NextResponse.json({
      success: true,
      data: {
        count: result.count,
        type,
        targetCount: targetUserIds.length,
      },
    })
  } catch (error) {
    console.error('发送通知失败:', error)
    return NextResponse.json({ success: false, error: '发送通知失败' }, { status: 500 })
  }
}