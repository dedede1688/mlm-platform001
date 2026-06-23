import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { WithdrawalAuditLogService } from '@/lib/services/withdrawal-audit-log.service'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error: authError } = await verifyPermission(request, ['finance_admin', 'super_admin'])
    if (authError) return authError

    const { id } = await params
    const logs = await WithdrawalAuditLogService.getAuditLogs(id)

    return NextResponse.json({ success: true, data: logs })
  } catch (error) {
    console.error('Get audit logs error:', error)
    return NextResponse.json({ success: false, message: '获取审核日志失败' }, { status: 500 })
  }
}