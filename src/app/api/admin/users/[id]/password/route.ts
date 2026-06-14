import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'
import { logOperation } from '@/lib/utils/operation-log'
import bcrypt from 'bcryptjs'

// PUT /api/admin/users/[id]/password — 管理员重置会员密码
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
    const { newPassword, reason } = body

    // 1. 参数校验
    if (!newPassword || typeof newPassword !== 'string') {
      return NextResponse.json(
        { success: false, message: '新密码不能为空' },
        { status: 400 }
      )
    }

    if (newPassword.length < 8 || newPassword.length > 20) {
      return NextResponse.json(
        { success: false, message: '密码长度必须在 8-20 位之间' },
        { status: 400 }
      )
    }

    if (!/[a-zA-Z]/.test(newPassword)) {
      return NextResponse.json(
        { success: false, message: '密码必须包含字母' },
        { status: 400 }
      )
    }

    if (!/[0-9]/.test(newPassword)) {
      return NextResponse.json(
        { success: false, message: '密码必须包含数字' },
        { status: 400 }
      )
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      return NextResponse.json(
        { success: false, message: '原因至少 5 个字' },
        { status: 400 }
      )
    }

    // 2. 查用户
    const existing = await prisma.user.findUnique({ where: { id } })
    if (!existing || existing.status === 'deleted') {
      return NextResponse.json(
        { success: false, message: '用户不存在' },
        { status: 404 }
      )
    }

    // 3. bcrypt 加密
    const passwordHash = await bcrypt.hash(newPassword, 10)

    // 4. 更新密码
    await prisma.user.update({
      where: { id },
      data: { passwordHash },
    })

    // 5. 写操作日志（不记录密码内容）
    await logOperation({
      userId: admin.id,
      action: 'UPDATE',
      module: 'user',
      targetId: id,
      oldValue: { action: 'password_reset' },
      newValue: { action: 'password_reset_by_admin', adminPhone: admin.phone },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    console.log(`[PasswordReset] 管理员 ${admin.phone} 重置了用户 ${existing.phone} 的密码，原因：${reason}`)

    return NextResponse.json({
      success: true,
      data: null,
      message: '密码重置成功',
    })
  } catch (error) {
    console.error('Reset password error:', error)
    return NextResponse.json(
      { success: false, message: '密码重置失败' },
      { status: 500 }
    )
  }
}
