import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, getClientIP, rateLimitResponse } from '@/lib/utils/rate-limit'

async function isInMyTeam(meId: string, target: { id: string; referrerId: string | null }): Promise<boolean> {
  if (target.id === meId) return true
  if (target.referrerId === meId) return true
  let cur = await prisma.user.findUnique({ where: { id: meId }, select: { referrerId: true } })
  for (let i = 0; i < 10 && cur?.referrerId; i++) {
    if (cur.referrerId === target.id) return true
    cur = await prisma.user.findUnique({ where: { id: cur.referrerId }, select: { referrerId: true } })
  }
  let curP = await prisma.user.findUnique({ where: { id: meId }, select: { parentId: true } })
  for (let i = 0; i < 10 && curP?.parentId; i++) {
    if (curP.parentId === target.id) return true
    curP = await prisma.user.findUnique({ where: { id: curP.parentId }, select: { parentId: true } })
  }
  return false
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      )
    }

    const clientIP = getClientIP(request)
    const limitResult = checkRateLimit(`lookup:ip:${clientIP}`, 10, 60 * 1000)
    if (!limitResult.allowed) {
      return rateLimitResponse('查询过于频繁，请稍后再试', limitResult.resetIn)
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
      select: { id: true, phone: true, nickname: true, referrerId: true },
    })

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      )
    }

    const inTeam = await isInMyTeam(user.userId, targetUser)
    if (!inTeam) {
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
