import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { logger } from '@/lib/logger'
import { UserService } from '@/lib/services/user.service'

export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['support_admin', 'super_admin'])
    if (authError || !admin) return authError!
    const { searchParams } = new URL(request.url)
    const result = await UserService.getUsersList({
      page: Math.max(1, parseInt(searchParams.get('page') || '1')),
      pageSize: Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20'))),
      level: searchParams.get('level')?.trim() || undefined,
      search: searchParams.get('search')?.trim() || undefined,
      status: searchParams.get('status')?.trim() || undefined,
      startDate: searchParams.get('startDate')?.trim() || undefined,
      endDate: searchParams.get('endDate')?.trim() || undefined,
      sortBy: searchParams.get('sortBy')?.trim() || 'createdAt',
      sortOrder: searchParams.get('sortOrder')?.trim() || 'desc',
    })
    return NextResponse.json({
      success: true, data: result.users, message: '获取会员列表成功',
      pagination: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: Math.ceil(result.total / result.pageSize) },
    })
  } catch (error) {
    logger.error('Admin get users error:', error)
    return NextResponse.json({ success: false, message: '获取会员列表失败' }, { status: 500 })
  }
}
