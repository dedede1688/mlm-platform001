import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/utils/auth'

// 获取用户的积分解锁计划
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      )
    }

    const schedules = await prisma.pointsUnlockSchedule.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      success: true,
      data: schedules,
    })
  } catch (error) {
    console.error('获取积分解锁计划失败:', error)
    return NextResponse.json(
      { error: '获取积分解锁计划失败' },
      { status: 500 }
    )
  }
}