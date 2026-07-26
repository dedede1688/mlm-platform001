import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { NotificationService } from '@/lib/services/notification.service'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError || !admin) return authError!
    const { id } = await params
    const template = await NotificationService.getTemplateById(id)
    if (!template) return NextResponse.json({ success: false, error: '?????' }, { status: 404 })
    return NextResponse.json({ success: true, data: template })
  } catch (error) {
    logger.error('????????:', error)
    return NextResponse.json({ success: false, error: '????????' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError || !admin) return authError!
    const { id } = await params
    const body = await request.json()
    const { type, channel, subject, content, enabled } = body
    const data: Record<string, unknown> = {}
    if (type !== undefined) data.type = type
    if (channel !== undefined) data.channel = channel
    if (subject !== undefined) data.subject = subject
    if (content !== undefined) data.content = content
    if (enabled !== undefined) data.enabled = enabled
    const updated = await NotificationService.updateTemplate(id, data)
    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    logger.error('????????:', error)
    return NextResponse.json({ success: false, error: '????????' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError || !admin) return authError!
    const { id } = await params
    await NotificationService.deleteTemplate(id)
    return NextResponse.json({ success: true, message: '?????' })
  } catch (error) {
    logger.error('????????:', error)
    return NextResponse.json({ success: false, error: '????????' }, { status: 500 })
  }
}
