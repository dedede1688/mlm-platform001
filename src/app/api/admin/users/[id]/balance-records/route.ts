import { NextRequest } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { UserService } from '@/lib/services/user.service'
import { logger } from '@/lib/logger'
import { errorResponse, successResponse } from '@/lib/api-response'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: _admin, error: authError } = await verifyPermission(request, ['support_admin', 'super_admin'])
    if (authError || !_admin) return authError!

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)
    const type = searchParams.get('type') || undefined
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined

    const user = await UserService.getUserById(id)
    if (!user || user.status === 'deleted') {
      return errorResponse('用户不存在', 404)
    }

    const { records, pagination } = await UserService.getUserBalanceRecords(id, page, limit, { type, startDate, endDate })

    return successResponse({
      user: {
        id: user.id, phone: user.phone, nickname: user.nickname,
        balance: user.balance, frozenBalance: user.frozenBalance,
        consumeBalance: user.consumeBalance ?? 0,
        earningsPending: user.earningsPending ?? 0,
        earningsAvailable: user.earningsAvailable ?? 0,
        earningsVoided: user.earningsVoided ?? 0,
      },
      records,
      pagination,
    })
  } catch (error) {
    logger.error('Admin get balance records error:', error)
    return errorResponse('获取余额流水失败', 500)
  }
}
