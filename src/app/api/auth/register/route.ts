import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { UserService } from '@/lib/services/user.service'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  try {
    const { phone, password, nickname, referrerCode } = await request.json()

    // 验证参数
    if (!phone || !password) {
      return NextResponse.json(
        { error: '手机号和密码不能为空' },
        { status: 400 }
      )
    }

    // 检查手机号是否已注册
    const existingUser = await prisma.user.findUnique({
      where: { phone },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: '手机号已注册' },
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
      data: {
        id: user.id,
        phone: user.phone,
        nickname: user.nickname,
        level: user.level,
      },
    })
  } catch (error) {
    console.error('Register error:', error)
    return NextResponse.json(
      { error: '注册失败' },
      { status: 500 }
    )
  }
}
