import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'
import { logOperation } from '@/lib/utils/operation-log'

// POST /api/admin/manual-reward — 手动发放奖励（管理员）
// 请求体：{ userId, amount, type?, reason }
export async function POST(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['finance_admin', 'super_admin'])
    if (authError || !admin) return authError!

    const { userId, amount, type, reason } = await request.json()

    // 参数验证
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { success: false, message: '缺少用户 ID' },
        { status: 400 }
      )
    }

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { success: false, message: '金额必须大于 0' },
        { status: 400 }
      )
    }

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return NextResponse.json(
        { success: false, message: '发放原因不能为空' },
        { status: 400 }
      )
    }

    // 查找用户
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user || user.status === 'deleted') {
      return NextResponse.json(
        { success: false, message: '用户不存在' },
        { status: 404 }
      )
    }

    const rewardType = type || 'manual'
    const rewardReason = reason.trim()

    // 使用事务：增加余额 + 创建手动奖励记录 + BalanceRecord 流水（v43-7 Batch 3）
    const result = await prisma.$transaction(async (tx) => {
      // 步骤 1：查旧值
      const before = await tx.user.findUnique({
        where: { id: userId },
        select: { balance: true, frozenBalance: true },
      })
      if (!before) throw new Error('用户不存在')

      // 步骤 2：变更（增加余额）
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { balance: { increment: amount }, earningsAvailable: { increment: amount } },
        select: { id: true, phone: true, nickname: true, balance: true },
      })

      // 步骤 3：创建手动奖励记录
      const manualReward = await tx.manualReward.create({
        data: {
          userId,
          amount,
          type: rewardType,
          reason: rewardReason,
          operatorId: admin.id,
        },
      })

      // 步骤 4：写 BalanceRecord
      await tx.balanceRecord.create({
        data: {
          userId,
          type: 'manual_reward',
          amount,
          balance: before.balance + amount,
          frozenBalance: before.frozenBalance,
          sourceType: 'manual_reward',
          sourceId: manualReward.id,
          description: `手动奖励 ¥${amount.toFixed(2)}，原因：${rewardReason}`,
        },
      })

      return { user: updatedUser, reward: manualReward }
    })

    // 记录操作日志
    await logOperation({
      userId: admin.id,
      action: 'CREATE',
      module: 'finance',
      targetId: result.reward.id,
      newValue: { userId, amount, type: rewardType, reason: rewardReason },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    return NextResponse.json({
      success: true,
      data: result,
      message: `已向 ${user.phone} 发放 ¥${amount.toFixed(2)} 奖励`,
    })
  } catch (error) {
    console.error('Admin manual reward error:', error)
    return NextResponse.json(
      { success: false, message: '手动发放奖励失败' },
      { status: 500 }
    )
  }
}