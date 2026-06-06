import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { generateToken } from '@/lib/utils/auth'

export async function POST(request: NextRequest) {
  try {
    const { phone, password } = await request.json()

    // 验证参数
    if (!phone || !password) {
      return NextResponse.json(
        { error: '手机号和密码不能为空' },
        { status: 400 }
      )
    }

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { phone },
    })

    if (!user) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 400 }
      )
    }

    // 验证密码
    const isValid = await bcrypt.compare(password, user.passwordHash)

    if (!isValid) {
      return NextResponse.json(
        { error: '密码错误' },
        { status: 400 }
      )
    }

    // 生成 JWT
    const token = generateToken(user.id, user.phone, user.role)

    return NextResponse.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          phone: user.phone,
          nickname: user.nickname,
          level: user.level,
          role: user.role,
          balance: user.balance,
          totalPoints: user.totalPoints,
          unlockedPoints: user.unlockedPoints,
        },
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: '登录失败' },
      { status: 500 }
    )
  }
}
