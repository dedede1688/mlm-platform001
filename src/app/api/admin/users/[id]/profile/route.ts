import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'
import { logOperation } from '@/lib/utils/operation-log'

// 角色等级（用于判断升降级）
const ROLE_HIERARCHY: Record<string, number> = {
  user: 0,
  auditor: 1,
  support_admin: 2,
  goods_admin: 3,
  finance_admin: 4,
  super_admin: 5,
}

const VALID_ROLES = Object.keys(ROLE_HIERARCHY)

// PUT /api/admin/users/[id]/profile — 管理员修改会员基础资料
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin, error: authError } = await verifyPermission(
      request, ['support_admin', 'super_admin']
    )
    if (authError || !admin) return authError!

    const { id } = await params
    const body = await request.json()
    const { phone, nickname, email, avatarUrl, role, reason } = body

    // 至少要改一个字段
    if (!phone && !nickname && !email && !avatarUrl && !role) {
      return NextResponse.json(
        { success: false, message: '至少需要修改一个字段' },
        { status: 400 }
      )
    }

    // 改 phone 或 role 必须填原因
    if ((phone || role) && (!reason || typeof reason !== 'string' || reason.trim().length < 5)) {
      return NextResponse.json(
        { success: false, message: '修改手机号或角色时，原因至少 5 个字' },
        { status: 400 }
      )
    }

    // 查目标用户
    const existing = await prisma.user.findUnique({ where: { id } })
    if (!existing || existing.status === 'deleted') {
      return NextResponse.json(
        { success: false, message: '用户不存在' },
        { status: 404 }
      )
    }

    // ---- 字段校验 ----

    // phone 校验
    if (phone !== undefined && phone !== null && phone !== '') {
      if (!/^1[3-9]\d{9}$/.test(phone)) {
        return NextResponse.json(
          { success: false, message: '手机号格式不正确' },
          { status: 400 }
        )
      }
      // 全库唯一性（排除自己）
      const duplicate = await prisma.user.findFirst({
        where: { phone, id: { not: id } },
      })
      if (duplicate) {
        return NextResponse.json(
          { success: false, message: '该手机号已被其他用户使用' },
          { status: 400 }
        )
      }
    }

    // email 校验
    if (email !== undefined && email !== null && email !== '') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json(
          { success: false, message: '邮箱格式不正确' },
          { status: 400 }
        )
      }
      // 全库唯一性（排除自己）
      const duplicate = await prisma.user.findFirst({
        where: { email, id: { not: id } },
      })
      if (duplicate) {
        return NextResponse.json(
          { success: false, message: '该邮箱已被其他用户使用' },
          { status: 400 }
        )
      }
    }

    // nickname 校验
    if (nickname !== undefined && nickname !== null && nickname !== '') {
      if (typeof nickname !== 'string' || nickname.length < 1 || nickname.length > 20) {
        return NextResponse.json(
          { success: false, message: '昵称长度必须在 1-20 个字符之间' },
          { status: 400 }
        )
      }
    }

    // role 校验 + 安全规则
    if (role !== undefined && role !== null && role !== '') {
      if (!VALID_ROLES.includes(role)) {
        return NextResponse.json(
          { success: false, message: `角色必须是以下值之一：${VALID_ROLES.join(', ')}` },
          { status: 400 }
        )
      }

      // 安全规则 1：非 super_admin 不能改 super_admin 的 role
      if (existing.role === 'super_admin' && admin.role !== 'super_admin') {
        return NextResponse.json(
          { success: false, message: '无权限修改超级管理员的角色' },
          { status: 403 }
        )
      }

      // 安全规则 2：非 super_admin 不能把任何人升为 super_admin
      if (role === 'super_admin' && admin.role !== 'super_admin') {
        return NextResponse.json(
          { success: false, message: '只有超级管理员才能授予 super_admin 角色' },
          { status: 403 }
        )
      }

      // 安全规则 3：不能把自己降级（role 等级降低）
      if (admin.id === id) {
        const currentLevel = ROLE_HIERARCHY[existing.role] ?? 0
        const newLevel = ROLE_HIERARCHY[role] ?? 0
        if (newLevel < currentLevel) {
          return NextResponse.json(
            { success: false, message: '不能将自己的角色降级' },
            { status: 400 }
          )
        }
      }
    }

    // ---- 构建更新数据 ----
    const updateData: Record<string, unknown> = {}
    if (phone !== undefined && phone !== null && phone !== '') updateData.phone = phone
    if (nickname !== undefined && nickname !== null && nickname !== '') updateData.nickname = nickname
    if (email !== undefined && email !== null && email !== '') updateData.email = email
    if (avatarUrl !== undefined && avatarUrl !== null && avatarUrl !== '') updateData.avatarUrl = avatarUrl
    if (role !== undefined && role !== null && role !== '') updateData.role = role

    // 记录旧值
    const oldValue = {
      phone: existing.phone,
      nickname: existing.nickname,
      email: existing.email,
      avatarUrl: existing.avatarUrl,
      role: existing.role,
    }

    // 执行更新
    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        phone: true,
        nickname: true,
        email: true,
        avatarUrl: true,
        role: true,
        updatedAt: true,
      },
    })

    // 写操作日志
    await logOperation({
      userId: admin.id,
      action: 'UPDATE',
      module: 'user',
      targetId: id,
      oldValue,
      newValue: {
        phone: updated.phone,
        nickname: updated.nickname,
        email: updated.email,
        avatarUrl: updated.avatarUrl,
        role: updated.role,
      },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    return NextResponse.json({
      success: true,
      data: updated,
      message: '资料修改成功',
    })
  } catch (error) {
    console.error('Update profile error:', error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : '资料修改失败' },
      { status: 500 }
    )
  }
}
