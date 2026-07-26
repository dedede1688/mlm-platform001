import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { logOperation } from '@/lib/utils/operation-log'
import { logger } from '@/lib/logger'
import { UserService } from '@/lib/services/user.service'

const ROLE_HIERARCHY: Record<string, number> = { user: 0, auditor: 1, support_admin: 2, goods_admin: 3, finance_admin: 4, super_admin: 5 }
const VALID_ROLES = Object.keys(ROLE_HIERARCHY)

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError || !admin) return authError!
    const { id } = await params
    const body = await request.json()
    const { phone, nickname, email, avatarUrl, role, reason } = body
    if (!phone && !nickname && !email && !avatarUrl && !role) { return NextResponse.json({ success: false, message: '至少需要修改一个字段' }, { status: 400 }) }
    if ((phone || role) && (!reason || typeof reason !== 'string' || reason.trim().length < 5)) { return NextResponse.json({ success: false, message: '修改手机号或角色时，原因至少 5 个字' }, { status: 400 }) }
    const existing = await UserService.getUserById(id)
    if (!existing || existing.status === 'deleted') { return NextResponse.json({ success: false, message: '用户不存在' }, { status: 404 }) }
    if (phone !== undefined && phone !== null && phone !== '') {
      if (!/^1[3-9]\d{9}$/.test(phone)) { return NextResponse.json({ success: false, message: '手机号格式不正确' }, { status: 400 }) }
      if (!(await UserService.checkPhoneUnique(phone, id))) { return NextResponse.json({ success: false, message: '该手机号已被其他用户使用' }, { status: 400 }) }
    }
    if (email !== undefined && email !== null && email !== '') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { return NextResponse.json({ success: false, message: '邮箱格式不正确' }, { status: 400 }) }
      if (!(await UserService.checkEmailUnique(email, id))) { return NextResponse.json({ success: false, message: '该邮箱已被其他用户使用' }, { status: 400 }) }
    }
    if (nickname !== undefined && nickname !== null && nickname !== '') {
      if (typeof nickname !== 'string' || nickname.length < 1 || nickname.length > 20) { return NextResponse.json({ success: false, message: '昵称长度必须在 1-20 个字符之间' }, { status: 400 }) }
    }
    if (role !== undefined && role !== null && role !== '') {
      if (!VALID_ROLES.includes(role)) { return NextResponse.json({ success: false, message: `角色必须是以下值之一：${VALID_ROLES.join(', ')}` }, { status: 400 }) }
      const currentRole = await UserService.getUserRole(id)
      if (currentRole === 'super_admin' && admin.role !== 'super_admin') { return NextResponse.json({ success: false, message: '无权限修改超级管理员的角色' }, { status: 403 }) }
      if (role === 'super_admin' && admin.role !== 'super_admin') { return NextResponse.json({ success: false, message: '只有超级管理员才能授予 super_admin 角色' }, { status: 403 }) }
      if (admin.id === id && (ROLE_HIERARCHY[role] ?? 0) < (ROLE_HIERARCHY[currentRole || 'user'] ?? 0)) { return NextResponse.json({ success: false, message: '不能将自己的角色降级' }, { status: 400 }) }
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
    return NextResponse.json({ success: true, data: updated, message: '资料修改成功' })
  } catch (error) {
    logger.error('Update profile error:', error)
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : '资料修改失败' }, { status: 500 })
  }
}
