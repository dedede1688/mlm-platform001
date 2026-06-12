import { NextRequest, NextResponse } from 'next/server'
import { DividendService } from '@/lib/services/dividend.service'
import { verifyPermission } from '@/lib/utils/admin-auth'

export async function POST(request: NextRequest) {
  try {
    // 验证管理员权限（仅 super_admin 和 finance_admin）
    const { user, error } = await verifyPermission(request, ['super_admin', 'finance_admin'])
    if (error || !user) {
      return error
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
      { success: false, error: '分红结算失败' },
      { status: 500 }
    )
  }
}

// 获取今日分红摘要
export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限（仅 super_admin、finance_admin 和 auditor）
    const { user, error } = await verifyPermission(request, ['super_admin', 'finance_admin', 'auditor'])
    if (error || !user) {
      return error
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
      { success: false, error: '获取分红摘要失败' },
      { status: 500 }
    )
  }
}