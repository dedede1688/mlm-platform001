import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'

// GET /api/admin/notifications/[id] — 获取单个通知模板
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['admin', 'super_admin'])
    if (authError || !admin) return authError!

    const { id } = await params
    const template = await prisma.notificationTemplate.findUnique({ where: { id } })

    if (!template) {
      return NextResponse.json(
        { success: false, error: '模板不存在' },
        { status: 404 }
      )
    }

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
    })
  } catch (error) {
    console.error('获取通知模板失败:', error)
    return NextResponse.json(
      { success: false, error: '获取通知模板失败' },
      { status: 500 }
    )
  }
}

// PUT /api/admin/notifications/[id] — 更新通知模板
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['admin', 'super_admin'])
    if (authError || !admin) return authError!

    const { id } = await params
    const body = await request.json()
    const { type, channel, subject, content, enabled } = body

    // 校验模板存在
    const existing = await prisma.notificationTemplate.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: '模板不存在' },
        { status: 404 }
      )
    }

    // 如果修改了 type 或 channel，检查唯一约束
    const newType = type ?? existing.type
    const newChannel = channel ?? existing.channel
    if (newType !== existing.type || newChannel !== existing.channel) {
      const duplicate = await prisma.notificationTemplate.findUnique({
        where: { type_channel: { type: newType, channel: newChannel } },
      })
      if (duplicate) {
        return NextResponse.json(
          { success: false, error: `类型"${newType}"的${newChannel === 'email' ? '邮件' : '短信'}模板已存在` },
          { status: 400 }
        )
      }
    }

    // email 渠道必须有主题
    if (newChannel === 'email' && !subject && !existing.subject) {
      return NextResponse.json(
        { success: false, error: '邮件模板必须填写主题' },
        { status: 400 }
      )
    }

    const template = await prisma.notificationTemplate.update({
      where: { id },
      data: {
        type: type ?? undefined,
        channel: channel ?? undefined,
        subject: subject !== undefined ? subject : undefined,
        content: content ?? undefined,
        enabled: enabled !== undefined ? enabled : undefined,
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
    })
  } catch (error) {
    console.error('更新通知模板失败:', error)
    return NextResponse.json(
      { success: false, error: '更新通知模板失败' },
      { status: 500 }
    )
  }
}

// DELETE /api/admin/notifications/[id] — 删除通知模板
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['admin', 'super_admin'])
    if (authError || !admin) return authError!

    const { id } = await params

    const existing = await prisma.notificationTemplate.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: '模板不存在' },
        { status: 404 }
      )
    }

    await prisma.notificationTemplate.delete({ where: { id } })

    return NextResponse.json({
      success: true,
      message: '模板已删除',
    })
  } catch (error) {
    console.error('删除通知模板失败:', error)
    return NextResponse.json(
      { success: false, error: '删除通知模板失败' },
      { status: 500 }
    )
  }
}