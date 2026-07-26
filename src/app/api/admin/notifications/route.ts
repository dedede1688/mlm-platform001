import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { NotificationService } from '@/lib/services/notification.service'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError || !admin) return authError!
    const templates = await NotificationService.getAllTemplates()
    return NextResponse.json({ success: true, data: templates })
  } catch (error) {
    logger.error('????????:', error)
    return NextResponse.json({ success: false, error: '????????' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError || !admin) return authError!
    const body = await request.json()
    const { type, channel, subject, content, enabled } = body
    if (!type || !channel || !content) {
      return NextResponse.json({ success: false, error: '????????????' }, { status: 400 })
    }
    if (!['email', 'sms', 'in_app'].includes(channel)) {
      return NextResponse.json({ success: false, error: '????? email?sms ? in_app' }, { status: 400 })
    }
    if (channel === 'email' && !subject) {
      return NextResponse.json({ success: false, error: '??????????' }, { status: 400 })
    }
    const existing = await NotificationService.findTemplateByTypeChannel(type, channel)
    if (existing) {
      const chLabel = channel === 'email' ? '??' : channel === 'sms' ? '??' : '???'
      return NextResponse.json({ success: false, error: `??"${type}"?${chLabel}?????` }, { status: 400 })
    }
    const template = await NotificationService.createTemplate({ type, channel, subject: subject ?? null, content, enabled: enabled ?? true })
    return NextResponse.json({ success: true, data: template }, { status: 201 })
  } catch (error) {
    logger.error('????????:', error)
    return NextResponse.json({ success: false, error: '????????' }, { status: 500 })
  }
}
