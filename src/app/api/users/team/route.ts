import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/utils/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      )
    }

    // 获取直接推荐的团队成员
    const teamMembers = await prisma.user.findMany({
      where: { referrerId: auth.userId },
      select: {
        id: true,
        phone: true,
        nickname: true,
        level: true,
        createdAt: true,
        _count: {
          select: { referrals: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    // 格式化数据
    const formattedMembers = teamMembers.map(member => ({
      id: member.id,
      phone: member.phone,
      nickname: member.nickname,
      level: member.level,
      createdAt: member.createdAt,
      directCount: member._count.referrals
    }))

    return NextResponse.json({ 
      success: true, 
      data: formattedMembers 
    })
  } catch (error) {
    console.error('获取团队成员失败:', error)
    return NextResponse.json({ 
      success: false, 
      error: '获取团队成员失败' 
    }, { status: 500 })
  }
}