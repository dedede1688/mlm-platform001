import { NextRequest, NextResponse } from 'next/server'
import { DividendService } from '@/lib/services/dividend.service'
import { verifyToken } from '@/lib/utils/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    // 验证管理员权限
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      )
    }

    // 检查是否为管理员（董事级别）
    const userInfo = await prisma.user.findUnique({
      where: { id: user.userId },
    })

    if (!userInfo || userInfo.level < 7) {
      return NextResponse.json(
        { error: '权限不足，需要董事级别' },
        { status: 403 }
      )
    }

    // 调用分红服务执行结算
    const result = await DividendService.settleDailyDividends()

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    console.error('分红结算失败:', error)
    return NextResponse.json(
      { success: false, error: error.message || '分红结算失败' },
      { status: 500 }
    )
  }
}

// 获取今日分红摘要
export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      )
    }

    // 检查是否为管理员（董事级别）
    const userInfo = await prisma.user.findUnique({
      where: { id: user.userId },
    })

    if (!userInfo || userInfo.level < 7) {
      return NextResponse.json(
        { error: '权限不足，需要董事级别' },
        { status: 403 }
      )
    }

    // 获取今日分红摘要
    const summary = await DividendService.getTodayDividendSummary()

    return NextResponse.json({
      success: true,
      data: summary,
    })
  } catch (error: any) {
    console.error('获取分红摘要失败:', error)
    return NextResponse.json(
      { success: false, error: error.message || '获取分红摘要失败' },
      { status: 500 }
    )
  }
}