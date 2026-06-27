import { NextRequest } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'
import { toCsv, csvResponse } from '@/lib/utils/csv-export'

// GET /api/admin/reports/export/finance?days=30 — 财务数据 CSV 导出（v51.2）
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin', 'finance_admin', 'auditor'])
    if (authError || !admin) return authError!

    const { searchParams } = new URL(request.url)
    const days = Math.min(90, Math.max(1, parseInt(searchParams.get('days') || '30')))

    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1)
    const validStatuses = ['paid', 'shipped', 'completed']

    const [incomeAgg, refundAgg, withdrawalAgg] = await Promise.all([
      prisma.order.aggregate({
        _sum: { payAmount: true },
        where: { status: { in: validStatuses }, createdAt: { gte: startDate } },
      }),
      prisma.refundRequest.aggregate({
        _sum: { amount: true },
        where: { status: 'completed', updatedAt: { gte: startDate } },
      }),
      prisma.withdrawal.aggregate({
        _sum: { amount: true },
        where: { status: 'completed', paidAt: { gte: startDate } },
      }),
    ])

    const income = incomeAgg._sum.payAmount || 0
    const refundTotal = refundAgg._sum.amount || 0
    const withdrawalTotal = withdrawalAgg._sum.amount || 0
    const expense = refundTotal + withdrawalTotal
    const netIncome = income - expense

    const rows = [
      { 指标: '总收入（销售订单 payAmount）', 金额: income.toFixed(2) },
      { 指标: '退款支出', 金额: refundTotal.toFixed(2) },
      { 指标: '提现支出', 金额: withdrawalTotal.toFixed(2) },
      { 指标: '总支出', 金额: expense.toFixed(2) },
      { 指标: '净收入', 金额: netIncome.toFixed(2) },
    ]

    const csv = toCsv(rows, [
      { key: '指标', label: '指标' },
      { key: '金额', label: '金额（元）' },
    ])
    const dateStr = now.toISOString().slice(0, 10)
    return csvResponse(`# 财务报表（${startDate.toISOString().slice(0, 10)} 至 ${dateStr}，近${days}天）\n${csv}`, `财务报表_${days}天_${dateStr}`)
  } catch (error) {
    console.error('[Finance CSV Export Error]', error)
    return new Response('服务器错误', { status: 500 })
  }
}
