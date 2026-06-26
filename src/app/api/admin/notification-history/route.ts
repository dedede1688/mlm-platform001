import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin', 'support_admin'])
    if (authError || !admin) return authError!

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const type = searchParams.get('type') || undefined
    const status = searchParams.get('status') || undefined

    const where: Record<string, unknown> = {}
    if (type) where.type = type
    if (status) where.status = status

    const skip = (page - 1) * limit

    const [batches, total] = await Promise.all([
      prisma.notificationBatch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          sender: { select: { id: true, nickname: true, phone: true } },
        },
      }),
      prisma.notificationBatch.count({ where }),
    ])

    const enriched = await Promise.all(
      batches.map(async (batch) => {
        const readCount = await prisma.notification.count({
          where: { batchId: batch.id, isRead: true },
        })
        return { ...batch, readCount }
      })
    )

    return NextResponse.json({
      success: true,
      data: {
        batches: enriched,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    })
  } catch (error) {
    console.error('获取发件箱列表失败:', error)
    return NextResponse.json({ success: false, error: '获取发件箱列表失败' }, { status: 500 })
  }
}