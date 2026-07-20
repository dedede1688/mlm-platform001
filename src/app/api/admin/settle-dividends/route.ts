import { NextRequest, NextResponse } from 'next/server'
import { DividendService } from '@/lib/services/dividend.service'
import { verifyPermission } from '@/lib/utils/admin-auth'

// POST: 手动触发分红操作
// body.action: 'snapshot'（默认，每日快照）或 'settle'（手动周结入账）
export async function POST(request: NextRequest) {
  try {
    const { user, error } = await verifyPermission(request, ['super_admin', 'finance_admin'])
    if (error || !user) {
      return error
    }

    let action = 'snapshot'
    try {
      const body = await request.json()
      if (body?.action === 'settle') {
        action = 'settle'
      }
    } catch {
      // 无 body 或非 JSON，默认 snapshot
    }

    let result
    if (action === 'settle') {
      result = await DividendService.settleWeeklyDividends()
    } else {
      result = await DividendService.snapshotDailyDividends()
    }

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    console.error('分红操作失败:', error)
    return NextResponse.json(
      { success: false, error: '分红操作失败' },
      { status: 500 }
    )
  }
}

// 获取今日分红摘要
export async function GET(request: NextRequest) {
  try {
    const { user, error } = await verifyPermission(request, ['super_admin', 'finance_admin', 'auditor'])
    if (error || !user) {
      return error
    }

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
