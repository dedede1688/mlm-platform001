import { prisma } from '@/lib/prisma'

export type RewardClaimResult =
  | 'claimed'
  | 'already_completed'
  | 'already_processing'
  | 'not_paid'
  | 'attempt_limit_reached'

const MAX_ATTEMPTS = 5
const PROCESSING_TIMEOUT_MS = 30 * 60 * 1000
const MAX_ERROR_LENGTH = 500

function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    let msg = error.message || 'Unknown error'
    msg = msg.replace(/token[=:]\s*\S+/gi, 'token=[REDACTED]')
    msg = msg.replace(/password[=:]\s*\S+/gi, 'password=[REDACTED]')
    msg = msg.replace(/secret[=:]\s*\S+/gi, 'secret=[REDACTED]')
    msg = msg.replace(/key[=:]\s*\S+/gi, 'key=[REDACTED]')
    if (msg.length > MAX_ERROR_LENGTH) {
      msg = msg.substring(0, MAX_ERROR_LENGTH - 3) + '...'
    }
    return msg
  }
  const str = String(error)
  return str.length > MAX_ERROR_LENGTH ? str.substring(0, MAX_ERROR_LENGTH - 3) + '...' : str
}

export class OrderRewardStateService {
  static async claim(orderId: string): Promise<RewardClaimResult> {
    const processingCutoff = new Date(Date.now() - PROCESSING_TIMEOUT_MS)

    const claimed = await prisma.order.updateMany({
      where: {
        id: orderId,
        status: { in: ['paid', 'shipped', 'completed'] },
        OR: [
          { rewardStatus: 'pending' },
          { rewardStatus: 'failed', rewardAttempts: { lt: MAX_ATTEMPTS } },
          { rewardStatus: 'processing', rewardLastAttemptAt: { lt: processingCutoff } },
        ],
      },
      data: {
        rewardStatus: 'processing',
        rewardLastAttemptAt: new Date(),
      },
    })

    if (claimed.count > 0) {
      return 'claimed'
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        status: true,
        rewardStatus: true,
        rewardAttempts: true,
        rewardLastAttemptAt: true,
      },
    })

    if (!order) return 'not_paid'
    if (!['paid', 'shipped', 'completed'].includes(order.status)) return 'not_paid'
    if (order.rewardStatus === 'completed') return 'already_completed'
    if (order.rewardStatus === 'processing' && order.rewardLastAttemptAt && order.rewardLastAttemptAt > processingCutoff) {
      return 'already_processing'
    }
    if (order.rewardStatus === 'failed' && order.rewardAttempts >= MAX_ATTEMPTS) {
      return 'attempt_limit_reached'
    }

    return 'not_paid'
  }

  static async markFailed(orderId: string, error: unknown): Promise<void> {
    const errorMessage = sanitizeError(error)

    await prisma.order.updateMany({
      where: { id: orderId, rewardStatus: 'processing' },
      data: {
        rewardStatus: 'failed',
        rewardAttempts: { increment: 1 },
        rewardLastError: errorMessage,
        rewardLastAttemptAt: new Date(),
      },
    })
  }
}