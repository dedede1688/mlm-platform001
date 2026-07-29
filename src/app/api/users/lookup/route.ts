import { NextRequest } from "next/server"
import { verifyToken } from "@/lib/utils/auth"
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/utils/rate-limit"
import { errorResponse, successResponse } from "@/lib/api-response"
import { logger } from "@/lib/logger"
import { UserService } from "@/lib/services/user.service"

export async function GET(request: NextRequest) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return errorResponse("未登录", 401)
    }

    const clientIP = getClientIP(request)
    const limitResult = await checkRateLimit("lookup:ip:" + clientIP, 10, 60 * 1000)
    if (!limitResult.allowed) {
      return rateLimitResponse("查询过于频繁，请稍后再试", limitResult.resetIn)
    }

    const { searchParams } = new URL(request.url)
    const phone = searchParams.get("phone")

    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return errorResponse("手机号格式不正确", 400)
    }

    const targetUser = await UserService.findByPhone(phone)

    if (!targetUser) {
      return errorResponse("用户不存在", 404)
    }

    const inTeam = await UserService.isInTeam(user.userId, { id: targetUser.id, referrerId: targetUser.referrerId })
    if (!inTeam) {
      return errorResponse("用户不存在", 404)
    }

    return successResponse({
      id: targetUser.id,
      phone: targetUser.phone,
      nickname: targetUser.nickname,
    })
  } catch (error) {
    logger.error("Lookup user error:", error)
    return errorResponse("查询失败", 500)
  }
}
