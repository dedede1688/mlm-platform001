import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { generateToken } from '@/lib/utils/auth'
import { errorResponse, successResponse } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { checkRateLimit, getClientIP, rateLimitResponse } from '@/lib/utils/rate-limit'
import { UserService } from '@/lib/services/user.service'
import { z } from 'zod'
import { parseBody } from '@/lib/validations/helper'

const loginSchema = z.object({
  phone: z.string().min(1, '???????').regex(/^1[3-9]\d{9}$/, '????????'),
  password: z.string().min(1, '??????'),
})

const COOKIE_NAME = 'auth_token'
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60

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
    const { data, error } = await parseBody(loginSchema, request)
    if (error) return error
    const { phone, password } = data

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

    if (!phone || !password) {
      return errorResponse('手机号和密码不能为空', 400)
    }

    const user = await UserService.findByPhone(phone)

    if (!user) {
      return errorResponse('用户不存在', 400)
    }

    const isValid = await bcrypt.compare(password, user.passwordHash)

    if (!isValid) {
      return errorResponse('密码错误', 400)
    }

    const token = generateToken(user.id, user.phone, user.role)

    const maskedPhone = phone.slice(0, 3) + '****' + phone.slice(-2)
    logger.info(`[Login] user=${maskedPhone} role=${user.role}`, { event: 'login_success', role: user.role, userId: user.id })

    const response = successResponse({
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
    })
    setAuthCookie(response, token)
    return response
  } catch (error) {
    logger.error('[Login] 登录失败', { event: 'login_error', errType: error instanceof Error ? error.constructor.name : typeof error })
    return errorResponse('登录失败，请稍后重试', 500)
  }
}
