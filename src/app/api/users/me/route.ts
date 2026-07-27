import { NextRequest } from "next/server"
import { verifyToken } from "@/lib/utils/auth"
import { getBusinessConfig } from "@/lib/config/business"
import { errorResponse, successResponse } from "@/lib/api-response"
import { logger } from "@/lib/logger"
import { UserService } from "@/lib/services/user.service"
import { z } from "zod"
import { parseBody } from "@/lib/validations/helper"

const updateProfileSchema = z.object({
  nickname: z.string().optional(),
  avatarUrl: z.string().optional(),
  email: z.string().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return errorResponse("未登录", 401)
    }

    const user = await UserService.getProfile(auth.userId)
    if (!user) {
      return errorResponse("用户不存在", 404)
    }

    const referralRate = await getBusinessConfig<number>("reward.referral_rate", 0.20)
    const brandBonusRate = await getBusinessConfig<number>("reward.brand_bonus_rate", 0.20)

    return successResponse({
      id: user.id,
      phone: user.phone,
      email: user.email,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      level: user.level,
      balance: user.balance,
      frozenBalance: user.frozenBalance,
      consumeBalance: user.consumeBalance ?? 0,
      earningsPending: user.earningsPending ?? 0,
      earningsAvailable: user.earningsAvailable ?? 0,
      earningsFrozen: user.earningsFrozen ?? 0,
      earningsVoided: user.earningsVoided ?? 0,
      totalPoints: user.totalPoints,
      unlockedPoints: user.unlockedPoints,
      lockedPoints: user.lockedPoints,
      referrerId: user.referrerId,
      parentId: user.parentId,
      directDistributorCount: user.directDistributorCount,
      directSalesAmount: user.directSalesAmount,
      upgradeProductCount: user.upgradeProductCount ?? 0,
      hasUpgradeProduct: (user.upgradeProductCount ?? 0) >= 1,
      hasPaymentPassword: !!user.paymentPasswordHash,
      referrals: user.referrals,
      createdAt: user.createdAt,
      referralRate,
      brandBonusRate,
    })
  } catch (error) {
    logger.error("Get user error:", error)
    return errorResponse("获取用户信息失败", 500)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return errorResponse("未登录", 401)
    }

    const { data, error } = await parseBody(updateProfileSchema, request)
    if (error) return error
    const { nickname, avatarUrl, email } = data

    const user = await UserService.updateProfile(auth.userId, { nickname, avatarUrl, email })

    return successResponse({
      id: user.id,
      phone: user.phone,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      email: user.email,
    })
  } catch (error) {
    logger.error("Update user error:", error)
    return errorResponse("更新用户信息失败", 500)
  }
}
