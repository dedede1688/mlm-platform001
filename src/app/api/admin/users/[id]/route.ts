import { NextRequest } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { logOperation } from '@/lib/utils/operation-log'
import { logger } from '@/lib/logger'
import { UserService } from '@/lib/services/user.service'
import { errorResponse, successResponse } from '@/lib/api-response'
import { parseBody } from '@/lib/validations/helper'
import { userLevelSchema } from '@/lib/validations/admin/users'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['support_admin', 'super_admin'])
    if (authError || !admin) return authError!
    const { id } = await params
    const { user, orderStats } = await UserService.getUserDetail(id)
    if (!user || user.status === 'deleted') {
      return errorResponse('用户不存在', 404)
    }
    const { passwordHash: _passwordHash, paymentPasswordHash, ...safeUser } = user as any
    return successResponse(
      { ...safeUser, hasPaymentPassword: !!paymentPasswordHash, orderCount: orderStats._count, totalOrderAmount: orderStats._sum.payAmount || 0 },
      '获取会员详情成功'
    )
  } catch (error) {
    logger.error('Admin get user error:', error)
    return errorResponse('获取会员详情失败', 500)
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['support_admin', 'super_admin'])
    if (authError || !admin) return authError!
    const { id } = await params

    const { data: body, error: parseError } = await parseBody(userLevelSchema, request)
    if (parseError) return parseError

    const existing = await UserService.getUserById(id)
    if (!existing || existing.status === 'deleted') {
      return errorResponse('用户不存在', 404)
    }

    const updatedUser = await UserService.updateUserLevel(id, body.level)
    await logOperation({
      userId: admin.id, action: 'UPDATE', module: 'user', targetId: id,
      oldValue: { level: existing.level }, newValue: { level: body.level },
    })
    return successResponse(updatedUser, `会员等级已调整为 ${body.level}`)
  } catch (error) {
    logger.error('Admin update user error:', error)
    return errorResponse('更新会员信息失败', 500)
  }
}
