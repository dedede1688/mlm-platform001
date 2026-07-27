import { NextRequest } from 'next/server'
import { UserService } from '@/lib/services/user.service'
import { verifyToken } from '@/lib/utils/auth'
import { errorResponse, successResponse } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { z } from 'zod'
import { parseQuery } from '@/lib/validations/helper'

const balanceRecordsQuerySchema = z.object({
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('20'),
  type: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return errorResponse('未登录', 401)
    }

    const { searchParams } = new URL(request.url)
    const qresult = parseQuery(balanceRecordsQuerySchema, searchParams)
    const params = ('error' in qresult ? { page: '1', limit: '20' } : qresult.data) as Record<string, string | undefined>
    const page = parseInt(params.page || '1')
    const limit = Math.min(parseInt(params.limit || '20'), 50)
    const type = params.type || undefined
    const startDate = params.startDate || undefined
    const endDate = params.endDate || undefined

    const result = await UserService.getUserBalanceRecords(auth.userId, page, limit, {
      type,
      startDate,
      endDate,
    })

    return successResponse(result)
  } catch (error) {
    logger.error('Get balance records error:', error)
    return errorResponse('获取余额流水失败', 500)
  }
}
