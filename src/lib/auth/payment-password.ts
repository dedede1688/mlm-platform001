import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

const SALT_ROUNDS = 10

export const PAYMENT_LOCK_THRESHOLD = 5
export const PAYMENT_LOCK_DURATION_MS = 15 * 60 * 1000

export async function hashPaymentPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPaymentPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function isValidPaymentPassword(password: string): boolean {
  return /^(?=.*[a-zA-Z])(?=.*\d).{6,}$/.test(password)
}

export async function checkPaymentPasswordLock(userId: string): Promise<{ locked: boolean; remainingMinutes?: number }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { failedAttempts: true, lockedUntil: true },
  })

  if (!user) return { locked: false }

  if (!user.lockedUntil) return { locked: false }

  const now = new Date()
  if (user.lockedUntil > now) {
    const remainingMs = user.lockedUntil.getTime() - now.getTime()
    const remainingMinutes = Math.ceil(remainingMs / (60 * 1000))
    return { locked: true, remainingMinutes }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { failedAttempts: 0, lockedUntil: null },
  })

  return { locked: false }
}

export async function incrementFailedAttempt(userId: string, ip?: string): Promise<{ attempts: number; locked: boolean }> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { failedAttempts: { increment: 1 } },
    select: { failedAttempts: true },
  })

  const attempts = updated.failedAttempts

  if (attempts >= PAYMENT_LOCK_THRESHOLD) {
    const lockedUntil = new Date(Date.now() + PAYMENT_LOCK_DURATION_MS)
    await prisma.user.update({
      where: { id: userId },
      data: { lockedUntil },
    })
    logger.info('支付密码已锁定', { userId, attempts, lockedUntil: lockedUntil.toISOString(), ip: ip ?? '-' })
    return { attempts, locked: true }
  }

  return { attempts, locked: false }
}

export async function resetPaymentPasswordLock(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { failedAttempts: 0, lockedUntil: null },
  })
}
