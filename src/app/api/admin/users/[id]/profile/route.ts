import { NextRequest } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { logOperation } from '@/lib/utils/operation-log'
import { logger } from '@/lib/logger'
import { UserService } from '@/lib/services/user.service'
import { errorResponse, successResponse } from '@/lib/api-response'
import { parseBody } from '@/lib/validations/helper'
import { userProfileUpdateSchema } from '@/lib/validations/admin/users'

const ROLE_HIERARCHY: Record<string, number> = { user: 0, auditor: 1, support_admin: 2, goods_admin: 3, finance_admin: 4, super_admin: 5 }

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError || !admin) return authError!
    const { id } = await params

    const { data: body, error: parseError } = await parseBody(userProfileUpdateSchema, request)
    if (parseError) return parseError

    const phone = body.phone || undefined
    const nickname = body.nickname || undefined
    const email = body.email || undefined
    const avatarUrl = body.avatarUrl || undefined
    const role = body.role || undefined

    if (!phone && !nickname && !email && !avatarUrl && !role) {
      return errorResponse('??????????', 400)
    }

    // reason ??????????????????? 5 ??
    if ((phone || role) && (!body.reason || body.reason.trim().length < 5)) {
      return errorResponse('?????????????? 5 ??', 400)
    }

    const existing = await UserService.getUserById(id)
    if (!existing || existing.status === 'deleted') {
      return errorResponse('?????', 404)
    }

    // ???????
    if (phone) {
      if (!(await UserService.checkPhoneUnique(phone, id))) {
        return errorResponse('????????????', 400)
      }
    }
    if (email) {
      if (!(await UserService.checkEmailUnique(email, id))) {
        return errorResponse('???????????', 400)
      }
    }

    // ????????????
    if (role) {
      const currentRole = await UserService.getUserRole(id)
      if (currentRole === 'super_admin' && admin.role !== 'super_admin') {
        return errorResponse('?????????????', 403)
      }
      if (role === 'super_admin' && admin.role !== 'super_admin') {
        return errorResponse('??????????? super_admin ??', 403)
      }
      if (admin.id === id && (ROLE_HIERARCHY[role] ?? 0) < (ROLE_HIERARCHY[currentRole || 'user'] ?? 0)) {
        return errorResponse('??????????', 400)
      }
    }

    const updateData: Record<string, unknown> = {}
    if (phone) updateData.phone = phone
    if (nickname) updateData.nickname = nickname
    if (email) updateData.email = email
    if (avatarUrl) updateData.avatarUrl = avatarUrl
    if (role) updateData.role = role

    const updated = await UserService.updateProfile(id, updateData)

    await logOperation({
      userId: admin.id, action: 'UPDATE', module: 'user', targetId: id,
      oldValue: { phone: existing.phone, nickname: existing.nickname, email: (existing as Record<string,unknown>).email, avatarUrl: (existing as Record<string,unknown>).avatarUrl, role: (existing as Record<string,unknown>).role },
      newValue: { phone: updated.phone, nickname: updated.nickname, email: updated.email, avatarUrl: updated.avatarUrl, role: updated.role },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    return successResponse(updated, '??????')
  } catch (error) {
    logger.error('Update profile error:', error)
    return errorResponse(error instanceof Error ? error.message : '??????', 500)
  }
}
