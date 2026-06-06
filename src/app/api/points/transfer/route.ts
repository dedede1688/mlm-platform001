import { NextRequest, NextResponse } from 'next/server'
import { PointsService } from '@/lib/services/points.service'
import { verifyToken } from '@/lib/utils/auth'
import { prisma } from '@/lib/prisma'

// 积分转赠
export async function POST(request: NextRequest) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      )
    }

    const { toUserPhone, points } = await request.json()

    if (!toUserPhone || !points || points <= 0) {
      return NextResponse.json(
        { error: '参数错误' },
        { status: 400 }
      )
    }

    // 查找接收用户
    const toUser = await prisma.user.findUnique({
      where: { phone: toUserPhone },
    })

    if (!toUser) {
      return NextResponse.json(
        { error: '接收用户不存在' },
        { status: 404 }
      )
    }

    // 获取手续费比例（默认10%）
    let feePercent = 10
    try {
      const feeConfig = await prisma.systemConfig.findUnique({
        where: { key: 'transfer_fee_percent' },
      })
      if (feeConfig) {
        feePercent = parseInt(feeConfig.value, 10) || 10
      }
    } catch (error) {
      console.error('获取手续费配置失败，使用默认值:', error)
    }

    // 执行转赠
    const result = await PointsService.transferPoints(user.userId, toUser.id, points, feePercent)

    return NextResponse.json({
      success: true,
      data: {
        fromUser: {
          id: result.fromUser.id,
          phone: result.fromUser.phone,
          nickname: result.fromUser.nickname,
        },
        toUser: {
          id: result.toUser.id,
          phone: result.toUser.phone,
          nickname: result.toUser.nickname,
        },
        amount: result.amount,
        feeAmount: result.feeAmount,
        totalDeduction: result.totalDeduction,
        feePercent,
      },
    })
  } catch (error: any) {
    console.error('积分转赠失败:', error)
    return NextResponse.json(
      { error: error.message || '积分转赠失败' },
      { status: 500 }
    )
  }
}