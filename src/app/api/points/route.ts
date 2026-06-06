import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/utils/auth'

// 获取用户的积分记录
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      )
    }

    const pointsRecords = await prisma.pointsRecord.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({
      success: true,
      data: pointsRecords,
    })
  } catch (error) {
    console.error('获取积分记录失败:', error)
    return NextResponse.json(
      { error: '获取积分记录失败' },
      { status: 500 }
    )
  }
}