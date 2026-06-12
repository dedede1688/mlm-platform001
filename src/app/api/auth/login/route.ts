import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { generateToken } from '@/lib/utils/auth'
import { checkRateLimit, getClientIP } from '@/lib/utils/rate-limit'
import { errorResponse } from '@/lib/api-response'

export async function POST(request: NextRequest) {
  try {
    const { phone, password } = await request.json()

    // 获取客户端IP
    const clientIP = getClientIP(request)

    // 检查IP速率限制（1分钟内最多5次）
    const ipLimitResult = checkRateLimit(`login:ip:${clientIP}`, 5, 60 * 1000)
    if (!ipLimitResult.allowed) {
      return errorResponse('登录尝试次数过多，请稍后再试', 429)
    }

    // 检查用户名速率限制（1分钟内最多5次）
    if (phone) {
      const userLimitResult = checkRateLimit(`login:user:${phone}`, 5, 60 * 1000)
      if (!userLimitResult.allowed) {
        return errorResponse('该账号登录尝试次数过多，请稍后再试', 429)
      }
    }

    // 验证参数
    if (!phone || !password) {
      return errorResponse('手机号和密码不能为空', 400)
    }

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { phone },
    })

    if (!user) {
      return errorResponse('用户不存在', 400)
    }

    // 验证密码
    const isValid = await bcrypt.compare(password, user.passwordHash)

    if (!isValid) {
      return errorResponse('密码错误', 400)
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
    return errorResponse('登录失败', 500)
  }
}
