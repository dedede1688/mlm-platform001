import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { NotificationService } from '@/lib/services/notification.service'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin', 'support_admin'])
    if (authError || !admin) return authError!
    const { id } = await params
    const batch = await NotificationService.getBatch(id)
    if (!batch) return NextResponse.json({ success: false, error: '?????' }, { status: 404 })
    const readCount = batch.notifications.filter(n => n.isRead).length
    return NextResponse.json({ success: true, data: { ...batch, readCount, recipientCount: batch.notifications.length } })
  } catch (error) {
    logger.error('????????:', error)
    return NextResponse.json({ success: false, error: '????????' }, { status: 500 })
  }
}
