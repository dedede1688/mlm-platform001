import { describe, it, expect, vi, beforeEach } from 'vitest'

// ====== Hoisted mocks ======
const mocks = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  getPaymentPasswordHash: vi.fn(),
  setPaymentPasswordHash: vi.fn(),
  hashPaymentPassword: vi.fn(),
  verifyPaymentPassword: vi.fn(),
  checkPaymentPasswordLock: vi.fn(),
  incrementFailedAttempt: vi.fn(),
  resetPaymentPasswordLock: vi.fn(),
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, resetIn: 0 }),
  getClientIP: vi.fn().mockReturnValue('127.0.0.1'),
  rateLimitResponse: vi.fn(),
}))

vi.mock('@/lib/utils/auth', () => ({ verifyToken: mocks.verifyToken }))
vi.mock('@/lib/services/user.service', () => ({
  UserService: {
    getPaymentPasswordHash: mocks.getPaymentPasswordHash,
    setPaymentPasswordHash: mocks.setPaymentPasswordHash,
  },
}))
vi.mock('@/lib/auth/payment-password', () => ({
  hashPaymentPassword: mocks.hashPaymentPassword,
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
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

// ====== Helpers ======
const userId = 'user-1'

function makeRequest(body: Record<string, unknown>) {
  return { method: 'POST', json: async () => body, headers: new Headers() } as any
}

function makePutRequest(body: Record<string, unknown>) {
  return { method: 'PUT', json: async () => body, headers: new Headers() } as any
}

// ====== Tests ======

describe('POST /api/user/payment-password/set', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('设置6位数字密码 123456 成功并调用hashPaymentPassword', async () => {
    mocks.verifyToken.mockResolvedValue({ userId, phone: '138' })
    mocks.getPaymentPasswordHash.mockResolvedValue(null)
    mocks.hashPaymentPassword.mockResolvedValue('$2b$10$hashed')

    const { POST } = await import('@/app/api/user/payment-password/set/route')
    const res = await POST(makeRequest({ password: '123456' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mocks.hashPaymentPassword).toHaveBeenCalledWith('123456')
    expect(mocks.setPaymentPasswordHash).toHaveBeenCalledWith(userId, '$2b$10$hashed')
  })

  it('设置字母数字混合密码 abc123 返回400且不保存', async () => {
    mocks.verifyToken.mockResolvedValue({ userId, phone: '138' })

    const { POST } = await import('@/app/api/user/payment-password/set/route')
    const res = await POST(makeRequest({ password: 'abc123' }))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.success).toBe(false)
    expect(mocks.hashPaymentPassword).not.toHaveBeenCalled()
    expect(mocks.setPaymentPasswordHash).not.toHaveBeenCalled()
  })

  it('设置5位数字 12345 返回400且不保存', async () => {
    mocks.verifyToken.mockResolvedValue({ userId, phone: '138' })

    const { POST } = await import('@/app/api/user/payment-password/set/route')
    const res = await POST(makeRequest({ password: '12345' }))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.success).toBe(false)
    expect(mocks.hashPaymentPassword).not.toHaveBeenCalled()
  })

  it('设置7位数字 1234567 返回400且不保存', async () => {
    mocks.verifyToken.mockResolvedValue({ userId, phone: '138' })

    const { POST } = await import('@/app/api/user/payment-password/set/route')
    const res = await POST(makeRequest({ password: '1234567' }))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.success).toBe(false)
    expect(mocks.hashPaymentPassword).not.toHaveBeenCalled()
  })
})

describe('PUT /api/user/payment-password/update', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('旧密码 legacyA1 + 新密码 654321 修改成功，旧密码原样传给verifyPaymentPassword', async () => {
    mocks.verifyToken.mockResolvedValue({ userId, phone: '138' })
    mocks.getPaymentPasswordHash.mockResolvedValue('$2b$10$old-hash')
    mocks.checkPaymentPasswordLock.mockResolvedValue({ locked: false })
    mocks.verifyPaymentPassword.mockResolvedValue(true)
    mocks.hashPaymentPassword.mockResolvedValue('$2b$10$new-hash')

    const { PUT } = await import('@/app/api/user/payment-password/update/route')
    const res = await PUT(makePutRequest({ oldPassword: 'legacyA1', newPassword: '654321' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mocks.verifyPaymentPassword).toHaveBeenCalledWith('legacyA1', '$2b$10$old-hash')
    expect(mocks.hashPaymentPassword).toHaveBeenCalledWith('654321')
  })

  it('字母数字新密码 newA12 被拒绝，不调用verifyPaymentPassword', async () => {
    mocks.verifyToken.mockResolvedValue({ userId, phone: '138' })

    const { PUT } = await import('@/app/api/user/payment-password/update/route')
    const res = await PUT(makePutRequest({ oldPassword: 'legacyA1', newPassword: 'newA12' }))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.success).toBe(false)
    expect(mocks.verifyPaymentPassword).not.toHaveBeenCalled()
    expect(mocks.hashPaymentPassword).not.toHaveBeenCalled()
  })

  it('修改成功后重置错误次数和锁定状态', async () => {
    mocks.verifyToken.mockResolvedValue({ userId, phone: '138' })
    mocks.getPaymentPasswordHash.mockResolvedValue('$2b$10$old-hash')
    mocks.checkPaymentPasswordLock.mockResolvedValue({ locked: false })
    mocks.verifyPaymentPassword.mockResolvedValue(true)
    mocks.hashPaymentPassword.mockResolvedValue('$2b$10$new-hash')

    const { PUT } = await import('@/app/api/user/payment-password/update/route')
    const res = await PUT(makePutRequest({ oldPassword: 'old123', newPassword: '654321' }))

    expect(res.status).toBe(200)
    expect(mocks.resetPaymentPasswordLock).toHaveBeenCalledWith(userId)
  })
})

// ====== 运行时类型守卫测试 ======

describe('POST /api/user/payment-password/set — 运行时类型守卫', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('数字类型 password=123456 返回400且不调用hash', async () => {
    mocks.verifyToken.mockResolvedValue({ userId, phone: '138' })

    const { POST } = await import('@/app/api/user/payment-password/set/route')
    const res = await POST(makeRequest({ password: 123456 }))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.success).toBe(false)
    expect(mocks.hashPaymentPassword).not.toHaveBeenCalled()
    expect(mocks.setPaymentPasswordHash).not.toHaveBeenCalled()
  })
})

describe('PUT /api/user/payment-password/update — 运行时类型守卫', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('数字类型 newPassword=654321 返回400，不调用verify/hash/保存', async () => {
    mocks.verifyToken.mockResolvedValue({ userId, phone: '138' })

    const { PUT } = await import('@/app/api/user/payment-password/update/route')
    const res = await PUT(makePutRequest({ oldPassword: 'legacyA1', newPassword: 654321 }))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.success).toBe(false)
    expect(mocks.verifyPaymentPassword).not.toHaveBeenCalled()
    expect(mocks.hashPaymentPassword).not.toHaveBeenCalled()
    expect(mocks.setPaymentPasswordHash).not.toHaveBeenCalled()
  })

  it('数字类型 oldPassword=123456 返回400，不调用verify或保存', async () => {
    mocks.verifyToken.mockResolvedValue({ userId, phone: '138' })

    const { PUT } = await import('@/app/api/user/payment-password/update/route')
    const res = await PUT(makePutRequest({ oldPassword: 123456, newPassword: '654321' }))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.success).toBe(false)
    expect(mocks.verifyPaymentPassword).not.toHaveBeenCalled()
    expect(mocks.hashPaymentPassword).not.toHaveBeenCalled()
    expect(mocks.setPaymentPasswordHash).not.toHaveBeenCalled()
  })
})

// ====== 锁定语义测试 ======

describe('PUT /api/user/payment-password/update — 锁定语义', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('旧密码错误返回401及剩余次数，不hash/保存新密码', async () => {
    mocks.verifyToken.mockResolvedValue({ userId, phone: '138' })
    mocks.getPaymentPasswordHash.mockResolvedValue('$2b$10$old-hash')
    mocks.checkPaymentPasswordLock.mockResolvedValue({ locked: false })
    mocks.verifyPaymentPassword.mockResolvedValue(false)
    mocks.incrementFailedAttempt.mockResolvedValue({ attempts: 3, locked: false })

    const { PUT } = await import('@/app/api/user/payment-password/update/route')
    const res = await PUT(makePutRequest({ oldPassword: 'wrongPwd', newPassword: '654321' }))
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data.success).toBe(false)
    expect(data.error).toBe('支付密码错误，剩余2次机会')
    expect(mocks.verifyPaymentPassword).toHaveBeenCalledWith('wrongPwd', '$2b$10$old-hash')
    expect(mocks.incrementFailedAttempt).toHaveBeenCalledWith(userId)
    expect(mocks.hashPaymentPassword).not.toHaveBeenCalled()
    expect(mocks.setPaymentPasswordHash).not.toHaveBeenCalled()
  })

  it('已锁定返回423，不调用verify/hash/保存', async () => {
    mocks.verifyToken.mockResolvedValue({ userId, phone: '138' })
    mocks.getPaymentPasswordHash.mockResolvedValue('$2b$10$old-hash')
    mocks.checkPaymentPasswordLock.mockResolvedValue({ locked: true, remainingMinutes: 12 })

    const { PUT } = await import('@/app/api/user/payment-password/update/route')
    const res = await PUT(makePutRequest({ oldPassword: 'legacyA1', newPassword: '654321' }))
    const data = await res.json()

    expect(res.status).toBe(423)
    expect(data.success).toBe(false)
    expect(data.error).toBe('支付密码已锁定，请12分钟后再试')
    expect(mocks.verifyPaymentPassword).not.toHaveBeenCalled()
    expect(mocks.hashPaymentPassword).not.toHaveBeenCalled()
    expect(mocks.setPaymentPasswordHash).not.toHaveBeenCalled()
  })

  it('修改成功仍调用resetPaymentPasswordLock', async () => {
    mocks.verifyToken.mockResolvedValue({ userId, phone: '138' })
    mocks.getPaymentPasswordHash.mockResolvedValue('$2b$10$old-hash')
    mocks.checkPaymentPasswordLock.mockResolvedValue({ locked: false })
    mocks.verifyPaymentPassword.mockResolvedValue(true)
    mocks.hashPaymentPassword.mockResolvedValue('$2b$10$new-hash')

    const { PUT } = await import('@/app/api/user/payment-password/update/route')
    const res = await PUT(makePutRequest({ oldPassword: 'oldPwd', newPassword: '654321' }))

    expect(res.status).toBe(200)
    expect(mocks.resetPaymentPasswordLock).toHaveBeenCalledWith(userId)
  })
})
