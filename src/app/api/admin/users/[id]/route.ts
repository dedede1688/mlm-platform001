import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { logOperation } from '@/lib/utils/operation-log'
import { logger } from '@/lib/logger'
import { UserService } from '@/lib/services/user.service'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['support_admin', 'super_admin'])
    if (authError || !admin) return authError!
    const { id } = await params
    const { user, orderStats } = await UserService.getUserDetail(id)
    if (!user || user.status === 'deleted') {
      return NextResponse.json({ success: false, message: '用户不存在' }, { status: 404 })
    }
    return NextResponse.json({
      success: true,
      data: { ...user, orderCount: orderStats._count, totalOrderAmount: orderStats._sum.payAmount || 0 },
      message: '获取会员详情成功',
    })
  } catch (error) {
    logger.error('Admin get user error:', error)
    return NextResponse.json({ success: false, message: '获取会员详情失败' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['support_admin', 'super_admin'])
    if (authError || !admin) return authError!
    const { id } = await params
    const body = await request.json()
    const { level } = body
    const existing = await UserService.getUserById(id)
    if (!existing || existing.status === 'deleted') {
      return NextResponse.json({ success: false, message: '用户不存在' }, { status: 404 })
    }
    if (level === undefined || level === null) {
      return NextResponse.json({ success: false, message: '缺少 level 参数' }, { status: 400 })
    }
    const newLevel = Number(level)
    if (isNaN(newLevel) || newLevel < 0 || newLevel > 7 || !Number.isInteger(newLevel)) {
      return NextResponse.json({ success: false, message: '等级必须为 0-7 的整数' }, { status: 400 })
    }
    const updatedUser = await UserService.updateUserLevel(id, newLevel)
    await logOperation({
      userId: admin.id, action: 'UPDATE', module: 'user', targetId: id,
      oldValue: { level: existing.level }, newValue: { level: newLevel },
    })
    return NextResponse.json({ success: true, data: updatedUser, message: `会员等级已调整为 ${newLevel}` })
  } catch (error) {
    logger.error('Admin update user error:', error)
    return NextResponse.json({ success: false, message: '更新会员信息失败' }, { status: 500 })
  }
}
