import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

import {
  isValidPaymentPassword,
  checkPaymentPasswordLock,
  incrementFailedAttempt,
  resetPaymentPasswordLock,
  PAYMENT_LOCK_THRESHOLD,
  PAYMENT_LOCK_DURATION_MS,
} from '@/lib/auth/payment-password'

import { prisma } from '@/lib/prisma'

describe('isValidPaymentPassword', () => {
  it('accepts 6+ chars with letters and digits', () => {
    expect(isValidPaymentPassword('abc123')).toBe(true)
    expect(isValidPaymentPassword('Abc123xyz')).toBe(true)
    expect(isValidPaymentPassword('a1b2c3')).toBe(true)
    expect(isValidPaymentPassword('Test12')).toBe(true)
  })

  it('rejects pure digits', () => {
    expect(isValidPaymentPassword('123456')).toBe(false)
  })

  it('rejects pure letters', () => {
    expect(isValidPaymentPassword('abcdef')).toBe(false)
    expect(isValidPaymentPassword('ABCDEF')).toBe(false)
  })

  it('rejects too short', () => {
    expect(isValidPaymentPassword('ab12')).toBe(false)
    expect(isValidPaymentPassword('a1b2c')).toBe(false)
  })

  it('rejects empty', () => {
    expect(isValidPaymentPassword('')).toBe(false)
  })
})

describe('checkPaymentPasswordLock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns locked=false when no lockedUntil', async () => {
    ;(prisma.user.findUnique as any).mockResolvedValueOnce({
      failedAttempts: 0,
      lockedUntil: null,
    })

    const result = await checkPaymentPasswordLock('user-1')
    expect(result).toEqual({ locked: false })
  })

  it('returns locked=true with remainingMinutes when locked', async () => {
    const lockedUntil = new Date(Date.now() + 10 * 60 * 1000)
    ;(prisma.user.findUnique as any).mockResolvedValueOnce({
      failedAttempts: 5,
      lockedUntil,
    })

    const result = await checkPaymentPasswordLock('user-1')
    expect(result.locked).toBe(true)
    expect(result.remainingMinutes).toBeGreaterThanOrEqual(10)
    expect(result.remainingMinutes).toBeLessThanOrEqual(11)
  })

  it('auto-unlocks when lockedUntil expired', async () => {
    const expiredTime = new Date(Date.now() - 1000)
    ;(prisma.user.findUnique as any).mockResolvedValueOnce({
      failedAttempts: 5,
      lockedUntil: expiredTime,
    })
    ;(prisma.user.update as any).mockResolvedValueOnce({ id: 'user-1' })

    const result = await checkPaymentPasswordLock('user-1')
    expect(result).toEqual({ locked: false })
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { failedAttempts: 0, lockedUntil: null },
    })
  })

  it('returns locked=false when user not found', async () => {
    ;(prisma.user.findUnique as any).mockResolvedValueOnce(null)

    const result = await checkPaymentPasswordLock('nonexistent')
    expect(result).toEqual({ locked: false })
  })
})

describe('incrementFailedAttempt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('increments and returns attempts without locking (< threshold)', async () => {
    ;(prisma.user.update as any).mockResolvedValueOnce({ failedAttempts: 3 })

    const result = await incrementFailedAttempt('user-1')
    expect(result).toEqual({ attempts: 3, locked: false })
    expect(prisma.user.update).toHaveBeenCalledTimes(1)
  })

  it('locks when attempts reach threshold', async () => {
    ;(prisma.user.update as any)
      .mockResolvedValueOnce({ failedAttempts: PAYMENT_LOCK_THRESHOLD })
      .mockResolvedValueOnce({ id: 'user-1' })

    const result = await incrementFailedAttempt('user-1')
    expect(result).toEqual({ attempts: PAYMENT_LOCK_THRESHOLD, locked: true })
    expect(prisma.user.update).toHaveBeenCalledTimes(2)
  })

  it('uses atomic increment operation', async () => {
    ;(prisma.user.update as any).mockResolvedValueOnce({ failedAttempts: 2 })

    await incrementFailedAttempt('user-1')
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { failedAttempts: { increment: 1 } },
      select: { failedAttempts: true },
    })
  })
})

describe('resetPaymentPasswordLock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resets failedAttempts and lockedUntil', async () => {
    ;(prisma.user.update as any).mockResolvedValueOnce({ id: 'user-1' })

    await resetPaymentPasswordLock('user-1')
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { failedAttempts: 0, lockedUntil: null },
    })
  })
})

describe('PAYMENT_LOCK constants', () => {
  it('threshold is 5', () => {
    expect(PAYMENT_LOCK_THRESHOLD).toBe(5)
  })

  it('duration is 15 minutes', () => {
    expect(PAYMENT_LOCK_DURATION_MS).toBe(15 * 60 * 1000)
  })
})
