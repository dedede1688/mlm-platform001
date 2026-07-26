import { NextRequest } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { logOperation } from '@/lib/utils/operation-log'
import { logger } from '@/lib/logger'
import { UserService } from '@/lib/services/user.service'
import { errorResponse, successResponse } from '@/lib/api-response'

const ROLE_HIERARCHY: Record<string, number> = { user: 0, auditor: 1, support_admin: 2, goods_admin: 3, finance_admin: 4, super_admin: 5 }
const VALID_ROLES = Object.keys(ROLE_HIERARCHY)

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError || !admin) return authError!
    const { id } = await params
    const body = await request.json()
    const { phone, nickname, email, avatarUrl, role, reason } = body
    if (!phone && !nickname && !email && !avatarUrl && !role) { return errorResponse('至少需要修改一个字段', 400) }
    if ((phone || role) && (!reason || typeof reason !== 'string' || reason.trim().length < 5)) { return errorResponse('修改手机号或角色时，原因至少 5 个字', 400) }
    const existing = await UserService.getUserById(id)
    if (!existing || existing.status === 'deleted') { return errorResponse('用户不存在', 404) }
    if (phone !== undefined && phone !== null && phone !== '') {
      if (!/^1[3-9]\d{9}$/.test(phone)) { return errorResponse('手机号格式不正确', 400) }
      if (!(await UserService.checkPhoneUnique(phone, id))) { return errorResponse('该手机号已被其他用户使用', 400) }
    }
    if (email !== undefined && email !== null && email !== '') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { return errorResponse('邮箱格式不正确', 400) }
      if (!(await UserService.checkEmailUnique(email, id))) { return errorResponse('该邮箱已被其他用户使用', 400) }
    }
    if (nickname !== undefined && nickname !== null && nickname !== '') {
      if (typeof nickname !== 'string' || nickname.length < 1 || nickname.length > 20) { return errorResponse('昵称长度必须在 1-20 个字符之间', 400) }
    }
    if (role !== undefined && role !== null && role !== '') {
      if (!VALID_ROLES.includes(role)) { return errorResponse(`角色必须是以下值之一：${VALID_ROLES.join(', ')}`, 400) }
      const currentRole = await UserService.getUserRole(id)
      if (currentRole === 'super_admin' && admin.role !== 'super_admin') { return errorResponse('无权限修改超级管理员的角色', 403) }
      if (role === 'super_admin' && admin.role !== 'super_admin') { return errorResponse('只有超级管理员才能授予 super_admin 角色', 403) }
      if (admin.id === id && (ROLE_HIERARCHY[role] ?? 0) < (ROLE_HIERARCHY[currentRole || 'user'] ?? 0)) { return errorResponse('不能将自己的角色降级', 400) }
    }
    const updateData: Record<string, unknown> = {}
    if (phone !== undefined && phone !== null && phone !== '') updateData.phone = phone
    if (nickname !== undefined && nickname !== null && nickname !== '') updateData.nickname = nickname
    if (email !== undefined && email !== null && email !== '') updateData.email = email
    if (avatarUrl !== undefined && avatarUrl !== null && avatarUrl !== '') updateData.avatarUrl = avatarUrl
    if (role !== undefined && role !== null && role !== '') updateData.role = role
    const updated = await UserService.updateProfile(id, updateData)
    await logOperation({
      userId: admin.id, action: 'UPDATE', module: 'user', targetId: id,
      oldValue: { phone: existing.phone, nickname: existing.nickname, email: (existing as Record<string,unknown>).email, avatarUrl: (existing as Record<string,unknown>).avatarUrl, role: (existing as Record<string,unknown>).role },
      newValue: { phone: updated.phone, nickname: updated.nickname, email: updated.email, avatarUrl: updated.avatarUrl, role: updated.role },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })
    return successResponse(updated, '资料修改成功')
  } catch (error) {
    logger.error('Update profile error:', error)
    return errorResponse(error instanceof Error ? error.message : '资料修改失败', 500)
  }
}
