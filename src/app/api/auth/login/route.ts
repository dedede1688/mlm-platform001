import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { generateToken } from '@/lib/utils/auth'
import { errorResponse } from '@/lib/api-response'

export async function POST(request: NextRequest) {
  try {
    const { phone, password } = await request.json()

    // [DEBUG] 临时注释速率限制，方便排查登录问题
    // const clientIP = getClientIP(request)
    // const ipLimitResult = checkRateLimit(`login:ip:${clientIP}`, 5, 60 * 1000)
    // if (!ipLimitResult.allowed) {
    //   return errorResponse('登录尝试次数过多，请稍后再试', 429)
    // }
    // if (phone) {
    //   const userLimitResult = checkRateLimit(`login:user:${phone}`, 5, 60 * 1000)
    //   if (!userLimitResult.allowed) {
    //     return errorResponse('该账号登录尝试次数过多，请稍后再试', 429)
    //   }
    // }

    // 验证参数
    if (!phone || !password) {
      return errorResponse('手机号和密码不能为空', 400)
    }

    // 查找用户
    console.log('[Login] 查找用户, phone:', phone)
    const user = await prisma.user.findUnique({
      where: { phone },
    })
    console.log('[Login] 用户查找结果:', user ? `找到用户 id=${user.id}, role=${user.role}` : '未找到用户')

    if (!user) {
      return errorResponse('用户不存在', 400)
    }

    // 验证密码
    console.log('[Login] 开始验证密码')
    const isValid = await bcrypt.compare(password, user.passwordHash)
    console.log('[Login] 密码验证结果:', isValid)

    if (!isValid) {
      return errorResponse('密码错误', 400)
    }

    // 生成 JWT
    console.log('[Login] 生成 JWT Token, userId:', user.id)
    const token = generateToken(user.id, user.phone, user.role)
    console.log('[Login] Token 生成成功')

    console.log('[Login] 登录成功，返回响应')
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
    console.error('[Login] 登录失败:', error)
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return errorResponse(`登录失败: ${errorMessage}`, 500)
  }
}
