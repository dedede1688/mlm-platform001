import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'

// GET /api/admin/notifications — 获取所有通知模板
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['admin', 'super_admin'])
    if (authError || !admin) return authError!

    const templates = await prisma.notificationTemplate.findMany({
      orderBy: [{ type: 'asc' }, { channel: 'asc' }],
    })

    return NextResponse.json({
      success: true,
      data: templates.map((t) => ({
        id: t.id,
        type: t.type,
        channel: t.channel,
        subject: t.subject,
        content: t.content,
        enabled: t.enabled,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    })
  } catch (error) {
    console.error('获取通知模板失败:', error)
    return NextResponse.json(
      { success: false, error: '获取通知模板失败' },
      { status: 500 }
    )
  }
}

// POST /api/admin/notifications — 创建通知模板
export async function POST(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['admin', 'super_admin'])
    if (authError || !admin) return authError!

    const body = await request.json()
    const { type, channel, subject, content, enabled } = body

    // 校验必填字段
    if (!type || !channel || !content) {
      return NextResponse.json(
        { success: false, error: '类型、渠道和内容为必填项' },
        { status: 400 }
      )
    }

    // 校验渠道值
    if (!['email', 'sms', 'in_app'].includes(channel)) {
      return NextResponse.json(
        { success: false, error: '渠道必须为 email、sms 或 in_app' },
        { status: 400 }
      )
    }

    // email 渠道必须有主题
    if (channel === 'email' && !subject) {
      return NextResponse.json(
        { success: false, error: '邮件模板必须填写主题' },
        { status: 400 }
      )
    }

    // 检查唯一约束
    const existing = await prisma.notificationTemplate.findUnique({
      where: { type_channel: { type, channel } },
    })
    if (existing) {
      return NextResponse.json(
        { success: false, error: `类型"${type}"的${channel === 'email' ? '邮件' : channel === 'sms' ? '短信' : '站内信'}模板已存在` },
        { status: 400 }
      )
    }

    const template = await prisma.notificationTemplate.create({
      data: {
        type,
        channel,
        subject: subject ?? null,
        content,
        enabled: enabled ?? true,
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        id: template.id,
        type: template.type,
        channel: template.channel,
        subject: template.subject,
        content: template.content,
        enabled: template.enabled,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('创建通知模板失败:', error)
    return NextResponse.json(
      { success: false, error: '创建通知模板失败' },
      { status: 500 }
    )
  }
}