import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import jwt from 'jsonwebtoken'
import { AuthUser } from '@/lib/utils/auth'

const JWT_SECRET = process.env.JWT_SECRET!

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: '未提供认证令牌' },
        { status: 401 }
      )
    }

    const token = authHeader.substring(7)
    let payload: AuthUser
    try {
      payload = jwt.verify(token, JWT_SECRET) as AuthUser
    } catch {
      return NextResponse.json(
        { success: false, error: '令牌无效或已过期' },
        { status: 401 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        phone: true,
        nickname: true,
        avatarUrl: true,
        level: true,
        role: true,
        balance: true,
        totalPoints: true,
        unlockedPoints: true,
      },
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: user,
    })
  } catch (error) {
    console.error('Get current user error:', error)
    return NextResponse.json(
      { success: false, error: '获取用户信息失败' },
      { status: 500 }
    )
  }
}