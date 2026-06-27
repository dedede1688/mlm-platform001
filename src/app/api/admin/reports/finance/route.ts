import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'

// GET /api/admin/reports/finance — 财务报表（v51.1）
// 参数: ?days=30
// 返回: { income, expense, netIncome, breakdown }
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin', 'finance_admin', 'auditor'])
    if (authError || !admin) return authError!

    const { searchParams } = new URL(request.url)
    const days = Math.min(90, Math.max(1, parseInt(searchParams.get('days') || '30')))

    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1)
    const validStatuses = ['paid', 'shipped', 'completed']

    // ---- 收入：销售订单 payAmount ----
    const incomeAgg = await prisma.order.aggregate({
      _sum: { payAmount: true },
      where: { status: { in: validStatuses }, createdAt: { gte: startDate } },
    })
    const income = incomeAgg._sum.payAmount || 0

    // ---- 支出：退款 + 提现成功 ----
    const [refundAgg, withdrawalAgg] = await Promise.all([
      prisma.refundRequest.aggregate({
        _sum: { amount: true },
        where: {
          status: 'completed',
          updatedAt: { gte: startDate },
        },
      }),
      prisma.withdrawal.aggregate({
        _sum: { amount: true },
        where: {
          status: 'completed',
          paidAt: { gte: startDate },
        },
      }),
    ])
    const refundTotal = refundAgg._sum.amount || 0
    const withdrawalTotal = withdrawalAgg._sum.amount || 0
    const expense = refundTotal + withdrawalTotal
    const netIncome = income - expense

    return NextResponse.json({
      success: true,
      data: {
        income: Math.round(income * 100) / 100,
        expense: Math.round(expense * 100) / 100,
        netIncome: Math.round(netIncome * 100) / 100,
        breakdown: {
          refundTotal: Math.round(refundTotal * 100) / 100,
          withdrawalTotal: Math.round(withdrawalTotal * 100) / 100,
        },
        period: { days, startDate: startDate.toISOString().slice(0, 10), endDate: now.toISOString().slice(0, 10) },
      },
    })
  } catch (error) {
    console.error('[Finance Report Error]', error)
    return NextResponse.json(
      { success: false, message: '服务器错误' },
      { status: 500 }
    )
  }
}
