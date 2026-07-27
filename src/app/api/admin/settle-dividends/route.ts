import { NextRequest } from 'next/server'
import { DividendService } from '@/lib/services/dividend.service'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { logger } from '@/lib/logger'
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/utils/rate-limit"
import { errorResponse, successResponse } from '@/lib/api-response'

// POST: 手动触发分红操作
// body.action: 'snapshot'（默认，每日快照）或 'settle'（手动周结入账）
export async function POST(request: NextRequest) {
  try {
    const { user, error } = await verifyPermission(request, ['super_admin', 'finance_admin'])
    if (error || !user) {
      return error
    }

    let action = 'snapshot'
    try {
      const body = await request.json()
      if (body?.action === 'settle') {
        action = 'settle'
      }
    } catch {
      // 无 body 或非 JSON，默认 snapshot
    }

    let result
    if (action === 'settle') {
      result = await DividendService.settleWeeklyDividends()
      if (result.paused === false) {
        // 正常成功分支
      } else {
        return errorResponse(result.paused ? result.message : '分红结算维护中，当前未执行任何资金操作', 503)
      }
    } else {
      result = await DividendService.snapshotDailyDividends()
    }

    return successResponse(result)
  } catch (error: unknown) {
    logger.error('分红操作失败:', error)
    return errorResponse('分红操作失败', 500)
  }
}

// 获取今日分红摘要
export async function GET(request: NextRequest) {
  try {
    const { user, error } = await verifyPermission(request, ['super_admin', 'finance_admin', 'auditor'])
    if (error || !user) {
      return error
    }

    const summary = await DividendService.getTodayDividendSummary()

    return successResponse(summary)
  } catch (error: unknown) {
    logger.error('获取分红摘要失败:', error)
    return errorResponse('获取分红摘要失败', 500)
  }
}
