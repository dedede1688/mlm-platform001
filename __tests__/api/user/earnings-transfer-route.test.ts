/**
 * 收益转余额路由测试
 *
 * 重点验证：
 * 1. 未登录返回 401
 * 2. 正常请求成功调用 service
 * 3. service 失败返回错误
 * 4. 成功后触发通知
 * 5. 通知失败不影响接口成功
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock verifyToken
vi.mock('@/lib/utils/auth', () => ({
  verifyToken: vi.fn(),
}))

// Mock EarningsTransferService
const { transferToBalanceMock } = vi.hoisted(() => ({
  transferToBalanceMock: vi.fn(),
}))
vi.mock('@/lib/services/earnings-transfer.service', () => ({
  EarningsTransferService: {
    transferToBalance: transferToBalanceMock,
  },
}))

// Mock OrderNotificationService
const { notifyEarningsTransferredMock } = vi.hoisted(() => ({
  notifyEarningsTransferredMock: vi.fn(),
}))
vi.mock('@/lib/services/order-notification.service', () => ({
  OrderNotificationService: {
    notifyEarningsTransferred: notifyEarningsTransferredMock,
  },
}))

// Mock logOperation
const { logOperationMock } = vi.hoisted(() => ({
  logOperationMock: vi.fn(),
}))
vi.mock('@/lib/utils/operation-log', () => ({
  logOperation: logOperationMock,
}))

import { verifyToken } from '@/lib/utils/auth'
import { EarningsTransferService } from '@/lib/services/earnings-transfer.service'
import { OrderNotificationService } from '@/lib/services/order-notification.service'
import { logOperation } from '@/lib/utils/operation-log'

// 辅助：构造 NextRequest
function makePostRequest(body: Record<string, unknown>) {
  return {
    method: 'POST',
    json: async () => body,
    headers: new Headers(),
  } as any
}

describe('POST /api/user/earnings-transfer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    notifyEarningsTransferredMock.mockResolvedValue(undefined)
    logOperationMock.mockResolvedValue(undefined)
  })

  it('未登录返回 401', async () => {
    vi.mocked(verifyToken).mockResolvedValueOnce(null)

    const { POST } = await import('@/app/api/user/earnings-transfer/route')
    const res = await POST(makePostRequest({ amount: 100 }))

    expect(res.status).toBe(401)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(EarningsTransferService.transferToBalance).not.toHaveBeenCalled()
  })

  it('正常请求成功调用 service 并触发通知', async () => {
    vi.mocked(verifyToken).mockResolvedValueOnce({ userId: 'user-1' } as any)
    transferToBalanceMock.mockResolvedValueOnce({
      userId: 'user-1',
      amount: 100,
      balance: 500,
      earningsAvailable: 200,
    })

    const { POST } = await import('@/app/api/user/earnings-transfer/route')
    const res = await POST(makePostRequest({ amount: 100 }))

    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.amount).toBe(100)
    expect(data.data.balance).toBe(500)
    expect(data.data.earningsAvailable).toBe(200)

    // 验证 service 被调用
    expect(EarningsTransferService.transferToBalance).toHaveBeenCalledWith('user-1', 100)

    // 验证通知被调用
    expect(OrderNotificationService.notifyEarningsTransferred).toHaveBeenCalledWith({
      userId: 'user-1',
      amount: 100,
      balance: 500,
      earningsAvailable: 200,
    })

    // 验证操作日志被调用
    expect(logOperation).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      action: 'TRANSFER',
      module: 'earnings',
    }))
  })

  it('service 失败返回错误', async () => {
    vi.mocked(verifyToken).mockResolvedValueOnce({ userId: 'user-2' } as any)
    transferToBalanceMock.mockRejectedValueOnce(new Error('可用收益不足'))

    const { POST } = await import('@/app/api/user/earnings-transfer/route')
    const res = await POST(makePostRequest({ amount: 999 }))

    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.error).toBe('可用收益不足')

    // 通知不应被调用
    expect(OrderNotificationService.notifyEarningsTransferred).not.toHaveBeenCalled()
  })

  it('通知失败不影响接口成功', async () => {
    vi.mocked(verifyToken).mockResolvedValueOnce({ userId: 'user-3' } as any)
    transferToBalanceMock.mockResolvedValueOnce({
      userId: 'user-3',
      amount: 50,
      balance: 300,
      earningsAvailable: 100,
    })
    // 通知抛错
    notifyEarningsTransferredMock.mockRejectedValueOnce(new Error('通知发送失败'))

    const { POST } = await import('@/app/api/user/earnings-transfer/route')
    const res = await POST(makePostRequest({ amount: 50 }))

    const data = await res.json()
    // 接口仍然成功
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)

    // 通知确实被调用了
    expect(OrderNotificationService.notifyEarningsTransferred).toHaveBeenCalled()
  })

  it('amount 为 0 时返回 400', async () => {
    vi.mocked(verifyToken).mockResolvedValueOnce({ userId: 'user-4' } as any)
    transferToBalanceMock.mockRejectedValueOnce(new Error('转入金额必须为有效数字且大于0'))

    const { POST } = await import('@/app/api/user/earnings-transfer/route')
    const res = await POST(makePostRequest({ amount: 0 }))

    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.error).toBe('转入金额必须为有效数字且大于0')
  })
})
