import { NextRequest } from 'next/server'
import { RewardService } from '@/lib/services/reward.service'
import { verifyToken } from '@/lib/utils/auth'
import { errorResponse, successResponse } from '@/lib/api-response'
import { logger } from '@/lib/logger'

// 获取用户的奖励记录
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return errorResponse('未登录', 401)
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || undefined

    const rewards = await RewardService.getUserRewards(auth.userId, type)

    return successResponse(rewards)
  } catch (error) {
    logger.error('Get rewards error:', error)
    return errorResponse('获取奖励记录失败', 500)
  }
}

// 获取奖励统计
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return errorResponse('未登录', 401)
    }

    const stats = await RewardService.getUserRewardStats(auth.userId)

    return successResponse(stats)
  } catch (error) {
    logger.error('Get reward stats error:', error)
    return errorResponse('获取奖励统计失败', 500)
  }
}
