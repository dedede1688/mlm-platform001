import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { errorResponse, successResponse } from '@/lib/api-response'

// v68.6:临时调试 API - 列出所有退款/订单/用户,方便造数据
// 仅 super_admin 可访问
export async function GET(request: NextRequest) {
  const { user, error } = await verifyPermission(request, ['super_admin'])
  if (error || !user) return error || errorResponse('未授权', 401)

  try {
    const [refunds, paidOrders, allUsers] = await Promise.all([
      prisma.refundRequest.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, phone: true, nickname: true } },
          order: { select: { id: true, orderNo: true, payAmount: true } },
        },
      }),
      prisma.order.findMany({
        where: { status: { in: ['paid', 'shipped', 'completed'] } },
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: { id: true, orderNo: true, payAmount: true, userId: true, status: true },
      }),
      prisma.user.findMany({
        where: { level: { gte: 1 } },
        take: 5,
        select: { id: true, phone: true, nickname: true, level: true },
      }),
    ])

    return successResponse({
      refunds,
      paidOrders,
      allUsers,
    })
  } catch (err: any) {
    return errorResponse(err.message, 500)
  }
}
