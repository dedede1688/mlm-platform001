import { NextRequest, NextResponse } from 'next/server'
import { PointsService } from '@/lib/services/points.service'
import { verifyToken } from '@/lib/utils/auth'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      )
    }

    const pointsRecords = await PointsService.getUserPointsRecords(auth.userId)

    return NextResponse.json({
      success: true,
      data: pointsRecords,
    })
  } catch (error) {
    logger.error('获取积分记录失败:', error)
    return NextResponse.json(
      { error: '获取积分记录失败' },
      { status: 500 }
    )
  }
}
