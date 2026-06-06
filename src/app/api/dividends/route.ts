import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/utils/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return NextResponse.json(
        { error: '未授权访问' },
        { status: 401 }
      )
    }

    // 获取用户的分红记录
    const dividends = await prisma.dividend.findMany({
      where: {
        userId: auth.userId
      },
      orderBy: {
        dividendDate: 'desc'
      },
      take: 50
    })

    return NextResponse.json({
      success: true,
      data: dividends
    })
  } catch (error) {
    console.error('获取分红记录失败:', error)
    return NextResponse.json(
      { error: '获取分红记录失败' },
      { status: 500 }
    )
  }
}