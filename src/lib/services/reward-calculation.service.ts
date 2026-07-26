import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { UserService } from './user.service'
import { MEMBER_LEVELS, BALANCE_SELECT } from '@/lib/constants'
import { getBusinessConfig } from '@/lib/config/business'
import { logger } from '@/lib/logger'
import { format4FieldDelta } from '@/lib/utils/balance-record-desc'
import { OrderRewardStateService } from './order-reward-state.service'

const POOL_TYPE_MAP: Record<number, string> = {
  3: 'director',
  4: 'manager',
  5: 'supervisor',
  6: 'president',
  7: 'board',
}

export type RewardProcessOutcome =
  | { status: 'completed'; orderId: string }
  | {
      status: 'skipped'
      orderId: string
      reason: 'already_completed' | 'already_processing' | 'not_paid' | 'attempt_limit_reached'
    }
  | { status: 'failed'; orderId: string; error: string }

type RewardQueryClient = Pick<Prisma.TransactionClient, 'user'>

async function findBrandBonusRecipients(
  buyerId: string,
  maxLayers: number,
  tx: RewardQueryClient
): Promise<Array<{ userId: string; layer: number }>> {
  const recipients: Array<{ userId: string; layer: number }> = []
  let currentId: string | null = buyerId
  let layer = 0
  const visited = new Set<string>()
  const MAX_DEPTH = 50

  while (layer < maxLayers && currentId && recipients.length < MAX_DEPTH) {
    const user: { parentId: string | null } | null = await tx.user.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    })
    if (!user?.parentId) break
    if (visited.has(user.parentId)) break
    visited.add(user.parentId)

    const parent = await tx.user.findUnique({
      where: { id: user.parentId },
      select: { id: true, level: true },
    })
    if (!parent) break

    layer++
    if (parent.level >= MEMBER_LEVELS.DISTRIBUTOR) {
      recipients.push({ userId: parent.id, layer })
    }

    currentId = user.parentId
  }

  return recipients
}

function computeMaxLayers(referrer: { level: number; directDistributorCount: number }): number {
  if (referrer.level >= MEMBER_LEVELS.DIRECTOR) return 10
  if (referrer.level === MEMBER_LEVELS.DISTRIBUTOR) {
    if (referrer.directDistributorCount >= 2) return 10
    if (referrer.directDistributorCount >= 1) return 4
    return 2
  }
  if (referrer.level >= MEMBER_LEVELS.MEMBER) return 10
  return 0
}

export class RewardCalculationService {
  static async processPaidOrderRewards(orderId: string): Promise<RewardProcessOutcome> {
    const claimResult = await OrderRewardStateService.claim(orderId)

    if (claimResult !== 'claimed') {
      return { status: 'skipped', orderId, reason: claimResult as RewardProcessOutcome['status'] extends 'skipped' ? any : never }
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { id: true, referrerId: true } },
        items: {
          include: { product: true },
        },
      },
    })

    if (!order || !['paid', 'shipped', 'completed'].includes(order.status)) {
      return { status: 'skipped', orderId, reason: 'not_paid' }
    }

    const buyer = order.user
    const orderAmount = order.payAmount

    try {
      await prisma.$transaction(async (tx) => {
        const userEarningsDelta: Record<string, number> = {}
        const allUserIds = new Set<string>()

        if (buyer.referrerId) {
          const referrer = await tx.user.findUnique({
            where: { id: buyer.referrerId },
            select: { upgradeProductCount: true },
          })

          if (referrer && referrer.upgradeProductCount >= 1) {
            const rate = await getBusinessConfig<number>('reward.referral_rate', 0.20)
            const amount = Math.round(orderAmount * rate * 100) / 100
            const idempotencyKey = `${orderId}:referral:${buyer.referrerId}:1`

            const reward = await tx.reward.create({
              data: {
                userId: buyer.referrerId,
                type: 'referral',
                orderId,
                amount,
                fromUserId: buyer.id,
                level: 1,
                status: 'paid',
                idempotencyKey,
              },
            })

            const before = await tx.user.findUnique({
              where: { id: buyer.referrerId },
              select: BALANCE_SELECT,
            })

            if (!before) throw new Error(`用户 ${buyer.referrerId} 不存在`)

            userEarningsDelta[buyer.referrerId] = (userEarningsDelta[buyer.referrerId] || 0) + amount
            allUserIds.add(buyer.referrerId)

            const after = { consumeBalance: before.consumeBalance, earningsAvailable: before.earningsAvailable + amount, earningsPending: before.earningsPending, earningsVoided: before.earningsVoided }
            await tx.balanceRecord.create({
              data: {
                userId: buyer.referrerId,
                type: 'referral_reward',
                amount,
                balance: before.balance,
                frozenBalance: before.frozenBalance,
                sourceType: 'reward',
                sourceId: reward.id,
                description: `直推奖 +¥${amount.toFixed(2)}，可提现收益增加，余额不变，订单 ${orderId}${format4FieldDelta(before, after)}`,
              },
            })
          }
        }

        if (buyer.referrerId) {
          const referrer = await tx.user.findUnique({
            where: { id: buyer.referrerId },
            select: { level: true, directDistributorCount: true },
          })

          if (referrer) {
            const maxLayers = computeMaxLayers(referrer)
            if (maxLayers > 0) {
              const paidCount = await tx.order.count({
                where: { userId: buyer.id, status: { in: ['paid', 'shipped', 'completed'] } },
              })
              const targetLayer = ((paidCount - 1) % 10) + 1

              const recipients = await findBrandBonusRecipients(buyer.id, maxLayers, tx)
              const target = recipients.find(r => r.layer === targetLayer)

              if (target) {
                const rate = await getBusinessConfig<number>('reward.brand_bonus_rate', 0.20)
                const amount = Math.round(orderAmount * rate * 100) / 100
                const idempotencyKey = `${orderId}:brand_bonus:${target.userId}:${target.layer}`

                const reward = await tx.reward.create({
                  data: {
                    userId: target.userId,
                    type: 'brand_bonus',
                    orderId,
                    amount,
                    fromUserId: buyer.id,
                    level: target.layer,
                    status: 'paid',
                    idempotencyKey,
                  },
                })

                const before = await tx.user.findUnique({
                  where: { id: target.userId },
                  select: BALANCE_SELECT,
                })

                if (!before) throw new Error(`用户 ${target.userId} 不存在`)

                userEarningsDelta[target.userId] = (userEarningsDelta[target.userId] || 0) + amount
                allUserIds.add(target.userId)

                const after = { consumeBalance: before.consumeBalance, earningsAvailable: before.earningsAvailable + amount, earningsPending: before.earningsPending, earningsVoided: before.earningsVoided }
                await tx.balanceRecord.create({
                  data: {
                    userId: target.userId,
                    type: 'brand_bonus',
                    amount,
                    balance: before.balance,
                    frozenBalance: before.frozenBalance,
                    sourceType: 'reward',
                    sourceId: reward.id,
                    description: `品牌管理奖（第${target.layer}层）+¥${amount.toFixed(2)}，可提现收益增加，余额不变，订单 ${orderId}${format4FieldDelta(before, after)}`,
                  },
                })
              } else {
                const rate = await getBusinessConfig<number>('reward.brand_bonus_rate', 0.20)
                const sinkAmount = Math.round(orderAmount * rate * 100) / 100
                await tx.operationLog.create({
                  data: {
                    userId: buyer.id,
                    action: 'BRAND_BONUS_SINK',
                    module: 'reward',
                    targetId: orderId,
                    newValue: { orderId, layer: targetLayer, orderAmount, sinkAmount, reason: '安置链无对应经销商或超过层数上限' },
                  },
                })
              }
            }
          }
        }

        const eligibleUsers: Array<{ userId: string; level: number }> = []
        let currentUserId: string = buyer.id
        const visited = new Set<string>()
        let depth = 0
        const MAX_DEPTH = 50

        while (depth < MAX_DEPTH) {
          depth++
          const user = await tx.user.findUnique({
            where: { id: currentUserId },
            select: { referrerId: true, level: true, id: true },
          })
          if (!user?.referrerId) break
          if (visited.has(user.referrerId)) break
          visited.add(user.referrerId)

          const referrer = await tx.user.findUnique({
            where: { id: user.referrerId },
            select: { id: true, level: true },
          })

          if (referrer && referrer.level >= MEMBER_LEVELS.DIRECTOR) {
            eligibleUsers.push({ userId: referrer.id, level: referrer.level })
          }
          currentUserId = user.referrerId
        }

        if (eligibleUsers.length > 0) {
          const pools = [
            { level: MEMBER_LEVELS.DIRECTOR, configKey: 'director' as const },
            { level: MEMBER_LEVELS.MANAGER, configKey: 'manager' as const },
            { level: MEMBER_LEVELS.SUPERVISOR, configKey: 'supervisor' as const },
            { level: MEMBER_LEVELS.PRESIDENT, configKey: 'president' as const },
            { level: MEMBER_LEVELS.BOARD, configKey: 'board' as const },
          ]

          for (const pool of pools) {
            const rate = await getBusinessConfig<number>(`dividend.${pool.configKey}.rate`, 0.05)
            if (rate === 0) continue

            const includeUpstream = await getBusinessConfig<boolean>(`dividend.${pool.configKey}.include_upstream`, false)

            const poolMembers = eligibleUsers.filter(u => {
              if (includeUpstream) return u.level >= pool.level
              return u.level === pool.level
            })

            if (poolMembers.length === 0) continue

            const totalPool = Math.round(orderAmount * rate * 100) / 100
            const perUserAmount = Math.round((totalPool / poolMembers.length) * 100) / 100
            const poolType = POOL_TYPE_MAP[pool.level]

            const dividendRecords: Array<{ id: string; userId: string; amount: number }> = []

            for (const member of poolMembers) {
              const dividend = await tx.dividend.create({
                data: {
                  userId: member.userId,
                  orderId,
                  amount: perUserAmount,
                  userLevel: member.level,
                  totalPool,
                  dividendDate: new Date(),
                  settled: true,
                  settleDate: new Date(),
                  settleBatchId: null,
                  refundedAt: null,
                  poolType,
                },
              })
              dividendRecords.push({ id: dividend.id, userId: dividend.userId, amount: dividend.amount })

              const dividendIdempotencyKey = `${orderId}:dividend:${member.userId}:${poolType}`
              await tx.reward.create({
                data: {
                  userId: member.userId,
                  type: 'dividend',
                  orderId,
                  amount: perUserAmount,
                  status: 'paid',
                  idempotencyKey: dividendIdempotencyKey,
                },
              })

              userEarningsDelta[member.userId] = (userEarningsDelta[member.userId] || 0) + perUserAmount
              allUserIds.add(member.userId)
            }

            const memberIds = poolMembers.map(m => m.userId)
            const usersMap = new Map<string, { id: string; balance: number; frozenBalance: number; consumeBalance: number; earningsAvailable: number; earningsPending: number; earningsVoided: number; earningsFrozen: number }>()
            if (memberIds.length > 0) {
              const users = await tx.user.findMany({
                where: { id: { in: memberIds } },
                select: { id: true, ...BALANCE_SELECT },
              })
              for (const u of users) usersMap.set(u.id, u)
            }

            const balanceRecordDataList: Array<{ userId: string; type: string; amount: number; balance: number; frozenBalance: number; sourceType: string; sourceId: string; description: string }> = []
            for (const dr of dividendRecords) {
              const before = usersMap.get(dr.userId)
              if (before) {
                const after = { consumeBalance: before.consumeBalance, earningsAvailable: before.earningsAvailable + perUserAmount, earningsPending: before.earningsPending, earningsVoided: before.earningsVoided }
                balanceRecordDataList.push({
                  userId: dr.userId,
                  type: 'dividend_reward',
                  amount: perUserAmount,
                  balance: before.balance,
                  frozenBalance: before.frozenBalance,
                  sourceType: 'dividend',
                  sourceId: dr.id,
                  description: `分红奖（${poolType}池）+¥${perUserAmount.toFixed(2)}，可提现收益增加，余额不变，订单 ${orderId}${format4FieldDelta(before, after)}`,
                })
              }
            }
            if (balanceRecordDataList.length > 0) {
              await tx.balanceRecord.createMany({ data: balanceRecordDataList })
            }
          }
        }

        for (const [userId, delta] of Object.entries(userEarningsDelta)) {
          if (delta > 0) {
            const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } })
            if (!user) throw new Error(`用户 ${userId} 不存在`)
            await tx.user.update({
              where: { id: userId },
              data: { earningsAvailable: { increment: delta } },
            })
          }
        }

        await tx.order.update({
          where: { id: orderId },
          data: {
            rewardStatus: 'completed',
            rewardLastError: null,
            rewardsCompletedAt: new Date(),
          },
        })
      })

      return { status: 'completed', orderId }
    } catch (error) {
      await OrderRewardStateService.markFailed(orderId, error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { status: 'failed', orderId, error: errorMessage }
    }
  }



}
