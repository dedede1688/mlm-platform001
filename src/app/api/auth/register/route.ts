import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { UserService } from '@/lib/services/user.service'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

// 注册输入校验 schema
const registerSchema = z.object({
  phone: z
    .string()
    .min(1, '手机号不能为空')
    .regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
  password: z
    .string()
    .min(1, '密码不能为空')
    .min(8, '密码长度至少8位')
    .regex(/[a-zA-Z]/, '密码必须包含字母')
    .regex(/[0-9]/, '密码必须包含数字'),
  nickname: z
    .string()
    .min(2, '昵称长度必须在2-20个字符之间')
    .max(20, '昵称长度必须在2-20个字符之间')
    .optional()
    .or(z.literal('')),
  referrerCode: z
    .string()
    .optional()
    .or(z.literal('')),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // 使用 zod 校验输入
    const validationResult = registerSchema.safeParse(body)
    if (!validationResult.success) {
      const errors = validationResult.error.issues
      const firstError = errors[0]?.message || '输入参数错误'
      return NextResponse.json(
        { success: false, message: firstError },
        { status: 400 }
      )
    }

    const { phone, password, nickname, referrerCode } = validationResult.data

    // 检查手机号是否已注册
    const existingUser = await prisma.user.findUnique({
      where: { phone },
    })

    if (existingUser) {
      return NextResponse.json(
        { success: false, message: '该手机号已注册' },
        { status: 400 }
      )
    }

    // 查找推荐人
    let referrerId: string | undefined
    if (referrerCode) {
      const referrer = await prisma.user.findFirst({
        where: {
          OR: [
            { phone: referrerCode },
            { id: referrerCode },
          ],
        },
      })

      if (referrer) {
        referrerId = referrer.id
      }
    }

    // 加密密码
    const passwordHash = await bcrypt.hash(password, 10)

    // 创建用户
    const user = await UserService.createUser({
      phone,
      passwordHash,
      nickname,
      referrerId,
    })

    return NextResponse.json({
      success: true,
      message: '注册成功',
      data: {
        id: user.id,
        phone: user.phone,
        nickname: user.nickname,
        level: user.level,
      },
    })
  } catch (error) {
    console.error('Register error:', error)
    const errMsg = error instanceof Error ? error.message : '未知错误'
    return NextResponse.json(
      { success: false, message: `注册失败：${errMsg}` },
      { status: 500 }
    )
  }
}
