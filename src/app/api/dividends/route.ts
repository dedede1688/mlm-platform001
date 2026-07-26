import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { logger } from '@/lib/logger'
import { DividendService } from '@/lib/services/dividend.service'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return NextResponse.json(
        { error: '未授权访问' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const dividends = await DividendService.getUserDividends(auth.userId, page, limit)

    return NextResponse.json({
      success: true,
      data: dividends
    })
  } catch (error) {
    logger.error('获取分红记录失败:', error)
    return NextResponse.json(
      { error: '获取分红记录失败' },
      { status: 500 }
    )
  }
}
