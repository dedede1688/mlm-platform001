import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { prisma } from '@/lib/prisma'

// 获取系统配置
export async function GET(request: NextRequest) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      )
    }

    // 检查是否为管理员（这里假设管理员等级为7，可以根据实际情况调整）
    const userInfo = await prisma.user.findUnique({
      where: { id: user.userId },
    })

    if (!userInfo || userInfo.level < 7) {
      return NextResponse.json(
        { error: '权限不足' },
        { status: 403 }
      )
    }

    const configs = await prisma.systemConfig.findMany()

    return NextResponse.json({
      success: true,
      data: configs,
    })
  } catch (error) {
    console.error('获取系统配置失败:', error)
    return NextResponse.json(
      { error: '获取系统配置失败' },
      { status: 500 }
    )
  }
}

// 更新系统配置
export async function PUT(request: NextRequest) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      )
    }

    // 检查是否为管理员
    const userInfo = await prisma.user.findUnique({
      where: { id: user.userId },
    })

    if (!userInfo || userInfo.level < 7) {
      return NextResponse.json(
        { error: '权限不足' },
        { status: 403 }
      )
    }

    const { key, value, description } = await request.json()

    if (!key || value === undefined) {
      return NextResponse.json(
        { error: '参数错误' },
        { status: 400 }
      )
    }

    // 更新或创建配置
    const config = await prisma.systemConfig.upsert({
      where: { key },
      update: {
        value: value.toString(),
        description,
      },
      create: {
        key,
        value: value.toString(),
        description,
      },
    })

    return NextResponse.json({
      success: true,
      data: config,
    })
  } catch (error: any) {
    console.error('更新系统配置失败:', error)
    return NextResponse.json(
      { error: '更新系统配置失败' },
      { status: 500 }
    )
  }
}