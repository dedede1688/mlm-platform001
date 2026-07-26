import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { generateToken } from '@/lib/utils/auth'
import { errorResponse } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { checkRateLimit, getClientIP, rateLimitResponse } from '@/lib/utils/rate-limit'

const COOKIE_NAME = 'auth_token'
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 // 7 days

function setAuthCookie(response: NextResponse, token: string) {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })
}

export async function POST(request: NextRequest) {
  try {
    const { phone, password } = await request.json()

    // v52.1: rate-limit - 双维度（IP + 账号），5 次/分钟
    const clientIP = getClientIP(request)
    const ipLimitResult = await checkRateLimit(`login:ip:${clientIP}`, 5, 60 * 1000)
    if (!ipLimitResult.allowed) {
      return rateLimitResponse('登录尝试次数过多，请稍后再试', ipLimitResult.resetIn)
    }
    if (phone) {
      const userLimitResult = await checkRateLimit(`login:user:${phone}`, 5, 60 * 1000)
      if (!userLimitResult.allowed) {
        return rateLimitResponse('该账号登录尝试次数过多，请稍后再试', userLimitResult.resetIn)
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

    // 登录成功日志：仅记录脱敏标识
    const maskedPhone = phone.slice(0, 3) + '****' + phone.slice(-2)
    logger.info(`[Login] user=${maskedPhone} role=${user.role}`, { event: 'login_success', role: user.role, userId: user.id })

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
    logger.error('[Login] 登录失败', { event: 'login_error', errType: error instanceof Error ? error.constructor.name : typeof error })
    return errorResponse('登录失败，请稍后重试', 500)
  }
}
