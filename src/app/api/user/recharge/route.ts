import { NextRequest } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { RechargeService } from '@/lib/services/recharge.service'
import { OrderNotificationService } from '@/lib/services/order-notification.service'

import { errorResponse, successResponse } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { z } from 'zod'
import { parseBody, parseQuery } from '@/lib/validations/helper'

const rechargeQuerySchema = z.object({
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('20'),
})

const createRechargeSchema = z.object({
  amount: z.number().positive('????????0'),
  paymentProofUrl: z.string().min(1, '???????'),
  remark: z.string().optional().default(''),
})

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return errorResponse('未登录', 401)
    }

    const { searchParams } = new URL(request.url)
    const qresult = parseQuery(rechargeQuerySchema, searchParams)
    const params = ('error' in qresult ? { page: '1', limit: '20' } : qresult.data) as Record<string, string | undefined>
    const page = parseInt(params.page || '1')
    const limit = parseInt(params.limit || '20')

    const result = await RechargeService.getUserRechargeRequests(auth.userId, page, limit)

    // 字段白名单：只返回用户需要看的字段，不暴露后台管理字段
    const safeRequests = result.requests.map((r) => ({
      id: r.id,
      amount: r.amount,
      paymentMethod: r.paymentMethod,
      paymentProofUrl: r.paymentProofUrl,
      status: r.status,
      rejectReason: r.rejectReason,
      reviewedAt: r.reviewedAt,
      approvedAt: r.approvedAt,
      createdAt: r.createdAt,
      remark: r.remark,
    }))

    return successResponse({
      requests: safeRequests,
      pagination: result.pagination,
    })
  } catch (error) {
    logger.error('Get recharge requests error:', error)
    return errorResponse('获取充值申请记录失败', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return errorResponse('未登录', 401)
    }

    const { data, error } = await parseBody(createRechargeSchema, request)
    if (error) return error
    const { amount, paymentProofUrl, remark } = data

    const recharge = await RechargeService.createRechargeRequest(auth.userId, {
      amount,
      paymentProofUrl,
      remark: remark ?? '',
    })

    // 字段白名单：与 GET 一致，不暴露后台管理字段
    const safeRecharge = {
      id: recharge.id,
      amount: recharge.amount,
      paymentMethod: recharge.paymentMethod,
      paymentProofUrl: recharge.paymentProofUrl,
      status: recharge.status,
      rejectReason: recharge.rejectReason,
      reviewedAt: recharge.reviewedAt,
      approvedAt: recharge.approvedAt,
      createdAt: recharge.createdAt,
      remark: recharge.remark,
    }

    // 通知用户：充值申请已提交（await 确保完成，catch 确保失败不影响主流程）
    await OrderNotificationService.notifyRechargeSubmitted({
      userId: auth.userId,
      rechargeId: recharge.id,
      amount: recharge.amount,
    }).catch(() => {})

    return successResponse(safeRecharge)
  } catch (error: unknown) {
    logger.error('Create recharge request error:', error)
    const message = error instanceof Error ? error.message : '创建充值申请失败'
    return errorResponse(message, 400)
  }
}
