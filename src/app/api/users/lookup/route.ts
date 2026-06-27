import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { prisma } from '@/lib/prisma'

// GET /api/users/lookup?phone=13800138000 — 查询用户基本信息（用于积分转赠接收方校验）
export async function GET(request: NextRequest) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const phone = searchParams.get('phone')

    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return NextResponse.json(
        { success: false, error: '手机号格式不正确' },
        { status: 400 }
      )
    }

    const targetUser = await prisma.user.findUnique({
      where: { phone },
      select: { id: true, phone: true, nickname: true },
    })

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        id: targetUser.id,
        phone: targetUser.phone,
        nickname: targetUser.nickname,
      },
    })
  } catch (error) {
    console.error('Lookup user error:', error)
    return NextResponse.json(
      { success: false, error: '查询失败' },
      { status: 500 }
    )
  }
}
