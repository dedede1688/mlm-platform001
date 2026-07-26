import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { OrderService } from '@/lib/services/order.service'
import { logger } from '@/lib/logger'

// GET /api/admin/orders ?? ???????????
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['goods_admin', 'super_admin'])
    if (authError || !admin) return authError!

    const { searchParams } = new URL(request.url)
    const result = await OrderService.getAdminOrders({
      page: Math.max(1, parseInt(searchParams.get('page') || '1')),
      pageSize: Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20'))),
      status: searchParams.get('status')?.trim() || undefined,
      search: searchParams.get('search')?.trim() || undefined,
    })

    return NextResponse.json({
      success: true,
      data: result.orders,
      message: '????????',
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / result.pageSize),
      },
    })
  } catch (error) {
    logger.error('Admin get orders error:', error)
    return NextResponse.json({ success: false, message: '????????' }, { status: 500 })
  }
}
