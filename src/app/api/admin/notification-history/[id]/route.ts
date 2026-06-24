import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['admin', 'super_admin'])
    if (authError || !admin) return authError!

    const { id } = await params

    const batch = await prisma.notificationBatch.findUnique({
      where: { id },
      include: {
        sender: { select: { id: true, nickname: true, phone: true } },
        notifications: {
          include: {
            user: { select: { id: true, nickname: true, phone: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!batch) {
      return NextResponse.json({ success: false, error: '批次不存在' }, { status: 404 })
    }

    const readCount = batch.notifications.filter((n) => n.isRead).length

    return NextResponse.json({
      success: true,
      data: {
        ...batch,
        readCount,
        recipientCount: batch.notifications.length,
      },
    })
  } catch (error) {
    console.error('获取批次详情失败:', error)
    return NextResponse.json({ success: false, error: '获取批次详情失败' }, { status: 500 })
  }
}