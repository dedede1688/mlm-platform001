import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  getPaymentPasswordHash: vi.fn(),
  verifyPaymentPassword: vi.fn(),
  checkPaymentPasswordLock: vi.fn(),
  incrementFailedAttempt: vi.fn(),
  resetPaymentPasswordLock: vi.fn(),
  createWithdrawal: vi.fn(),
  getUserWithdrawals: vi.fn(),
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, resetIn: 0 }),
  getClientIP: vi.fn().mockReturnValue('127.0.0.1'),
  rateLimitResponse: vi.fn(),
}))

vi.mock('@/lib/utils/auth', () => ({ verifyToken: mocks.verifyToken }))
vi.mock('@/lib/services/user.service', () => ({
  UserService: { getPaymentPasswordHash: mocks.getPaymentPasswordHash },
}))
vi.mock('@/lib/services/withdrawal.service', () => ({
  WithdrawalService: { createWithdrawal: mocks.createWithdrawal, getUserWithdrawals: mocks.getUserWithdrawals },
}))
vi.mock('@/lib/auth/payment-password', () => ({
  verifyPaymentPassword: mocks.verifyPaymentPassword,
  checkPaymentPasswordLock: mocks.checkPaymentPasswordLock,
  incrementFailedAttempt: mocks.incrementFailedAttempt,
  resetPaymentPasswordLock: mocks.resetPaymentPasswordLock,
  PAYMENT_LOCK_THRESHOLD: 5,
}))
vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  getClientIP: mocks.getClientIP,
  rateLimitResponse: mocks.rateLimitResponse,
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))

function makePostRequest(body: Record<string, unknown>) {
  return { method: 'POST', json: async () => body, headers: new Headers(), url: 'http://localhost/api/withdrawals' } as any
}

const userId = 'user-1'

describe('POST /api/withdrawals — 存量字母数字密码兼容', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('将 "legacyA1" 原样传给 verifyPaymentPassword，验证成功后才调 createWithdrawal', async () => {
    mocks.verifyToken.mockResolvedValue({ userId, phone: '138' })
    mocks.getPaymentPasswordHash.mockResolvedValue('$2b$10$hash')
    mocks.checkPaymentPasswordLock.mockResolvedValue({ locked: false })
    mocks.verifyPaymentPassword.mockResolvedValue(true)
    mocks.createWithdrawal.mockResolvedValue({ id: 'w-1' })

    const { POST } = await import('@/app/api/withdrawals/route')
    const res = await POST(makePostRequest({
      amount: 100,
      paymentMethod: 'alipay',
      accountNumber: 'test@example.com',
      accountName: 'Test',
      paymentPassword: 'legacyA1',
    }))

    expect(res.status).toBe(200)
    expect(mocks.verifyPaymentPassword).toHaveBeenCalledWith('legacyA1', '$2b$10$hash')
    expect(mocks.createWithdrawal).toHaveBeenCalled()
  })

  it('将 "123456" 原样传给 verifyPaymentPassword', async () => {
    mocks.verifyToken.mockResolvedValue({ userId, phone: '138' })
    mocks.getPaymentPasswordHash.mockResolvedValue('$2b$10$hash')
    mocks.checkPaymentPasswordLock.mockResolvedValue({ locked: false })
    mocks.verifyPaymentPassword.mockResolvedValue(true)
    mocks.createWithdrawal.mockResolvedValue({ id: 'w-2' })

    const { POST } = await import('@/app/api/withdrawals/route')
    const res = await POST(makePostRequest({
      amount: 50,
      paymentMethod: 'wechat',
      accountNumber: 'wxid',
      accountName: 'Test',
      paymentPassword: '123456',
    }))

    expect(res.status).toBe(200)
    expect(mocks.verifyPaymentPassword).toHaveBeenCalledWith('123456', '$2b$10$hash')
  })

  it('密码验证失败返回401，legacyA1原样传入，不创建提现不重置锁定', async () => {
    mocks.verifyToken.mockResolvedValue({ userId, phone: '138' })
    mocks.getPaymentPasswordHash.mockResolvedValue('$2b$10$hash')
    mocks.checkPaymentPasswordLock.mockResolvedValue({ locked: false })
    mocks.verifyPaymentPassword.mockResolvedValue(false)
    mocks.incrementFailedAttempt.mockResolvedValue({ attempts: 2, locked: false })

    const { POST } = await import('@/app/api/withdrawals/route')
    const res = await POST(makePostRequest({
      amount: 100,
      paymentMethod: 'alipay',
      accountNumber: 'test@example.com',
      accountName: 'Test',
      paymentPassword: 'legacyA1',
    }))
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(mocks.verifyPaymentPassword).toHaveBeenCalledWith('legacyA1', '$2b$10$hash')
    expect(mocks.createWithdrawal).not.toHaveBeenCalled()
    expect(mocks.resetPaymentPasswordLock).not.toHaveBeenCalled()
  })
})