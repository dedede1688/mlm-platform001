import { NextRequest } from "next/server"
import { verifyToken } from "@/lib/utils/auth"

import { errorResponse, successResponse } from "@/lib/api-response"
import { logger } from "@/lib/logger"
import { DividendService } from "@/lib/services/dividend.service"
import { z } from "zod"
import { parseQuery } from "@/lib/validations/helper"

const dividendsQuerySchema = z.object({
  page: z.string().optional().default("1"),
  limit: z.string().optional().default("50"),
})

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return errorResponse("未授权访问", 401)
    }

    const { searchParams } = new URL(request.url)
    const qresult = parseQuery(dividendsQuerySchema, searchParams)
    const params = ('error' in qresult ? { page: "1", limit: "50" } : qresult.data) as Record<string, string | undefined>
    const page = parseInt(params.page || "1")
    const limit = parseInt(params.limit || "50")
    const dividends = await DividendService.getUserDividends(auth.userId, page, limit)

    return successResponse(dividends)
  } catch (error) {
    logger.error("获取分红记录失败:", error)
    return errorResponse("获取分红记录失败", 500)
  }
}
