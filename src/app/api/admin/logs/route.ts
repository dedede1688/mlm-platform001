import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'

// GET /api/admin/logs — 获取操作日志列表（super_admin, auditor）
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin', 'auditor'])
    if (authError || !admin) return authError!

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20')))
    const module = searchParams.get('module')?.trim() || ''
    const action = searchParams.get('action')?.trim() || ''
    const userId = searchParams.get('userId')?.trim() || ''
    const startDate = searchParams.get('startDate')?.trim() || ''
    const endDate = searchParams.get('endDate')?.trim() || ''

    // 构建查询条件
    const where: Record<string, unknown> = {}

    if (module) {
      where.module = module
    }

    if (action) {
      where.action = action
    }

    if (userId) {
      where.userId = userId
    }

    if (startDate || endDate) {
      const createdAt: Record<string, Date> = {}
      if (startDate) createdAt.gte = new Date(startDate)
      if (endDate) createdAt.lte = new Date(new Date(endDate).setHours(23, 59, 59, 999))
      where.createdAt = createdAt
    }

    const [logs, total] = await Promise.all([
      prisma.operationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: { id: true, phone: true, nickname: true, role: true },
          },
        },
      }),
      prisma.operationLog.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      data: logs,
      message: '获取操作日志成功',
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('Admin get operation logs error:', error)
    return NextResponse.json(
      { success: false, message: '获取操作日志失败' },
      { status: 500 }
    )
  }
}