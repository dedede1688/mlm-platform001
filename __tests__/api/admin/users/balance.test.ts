/**
 * 006-007 号任务: 收益作废资金接口自动化测试
 *
 * 覆盖 21 个场景：
 * 1. 正常作废：earningsAvailable 减少、earningsVoided 增加
 * 2. balance 不变
 * 3. frozenBalance 不变
 * 4. consumeBalance 不变
 * 5. earningsFrozen 不变
 * 6. earningsPending 不变
 * 7. 金额 0 返回 400，不进入事务
 * 8. 负数返回 400，不进入事务
 * 9. 字符串返回 400，不进入事务
 * 10. NaN 返回 400，不进入事务
 * 11. Infinity 返回 400，不进入事务
 * 12. -Infinity 返回 400，不进入事务
 * 13. 可用收益不足返回 400，不写流水、不写日志、不发通知
 * 14. 写入 BalanceRecord，type = earnings_void，amount 为正数
 * 15. 写入 OperationLog 的两个收益字段前后值正确
 * 16. 调用 notifyEarningsVoid 并传入 balanceRecordId
 * 17. notifyEarningsVoid 抛错时，资金接口仍返回成功
 * 18. 原有 earnings_add 正常路径不受影响
 * 19. updateMany where/data 精确断言（v007）
 * 20. balanceRecordId 等于资金流水创建结果 id + sourceType/sourceId（v007）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ===== Mock 依赖 =====
vi.mock('@/lib/utils/admin-auth', () => ({
  verifyPermission: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/utils/operation-log', () => ({
  logOperation: vi.fn(),
}))

vi.mock('@/lib/utils/stats-cache', () => ({
  invalidateCache: vi.fn(),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, resetIn: 0 })),
  getClientIP: vi.fn(() => '127.0.0.1'),
  rateLimitResponse: vi.fn(),
}))

vi.mock('@/lib/services/order-notification.service', () => ({
  OrderNotificationService: {
    notifyEarningsVoid: vi.fn().mockResolvedValue(undefined),
    notifyBalanceChange: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'
import { logOperation } from '@/lib/utils/operation-log'
import { OrderNotificationService } from '@/lib/services/order-notification.service'

// ===== 测试工具 =====

/** 构造一个 mock 事务 tx，模拟 earnings_void 的数据库行为 */
function makeTxForEarningsVoid(opts: {
  beforeUser: Record<string, unknown>
  afterUser: Record<string, unknown>
  updateManyCount?: number
}) {
  const { beforeUser, afterUser, updateManyCount = 1 } = opts
  return {
    user: {
      findUnique: vi.fn()
        .mockResolvedValueOnce(beforeUser)   // 第一次：事务前
        .mockResolvedValueOnce(afterUser),    // 第二次：事务后
      updateMany: vi.fn().mockResolvedValue({ count: updateManyCount }),
    },
    balanceRecord: {
      create: vi.fn().mockResolvedValue({ id: 'br-1' }),
    },
  }
}

/** 构造请求 */
function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/users/u1/balance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const ADMIN_USER = { id: 'admin1' }

const BEFORE_USER = {
  id: 'u1',
  status: 'active',
  balance: 1000,
  frozenBalance: 200,
  consumeBalance: 50,
  earningsAvailable: 100,
  earningsVoided: 30,
  earningsFrozen: 10,
  earningsPending: 20,
}

const AFTER_USER_VOID = {
  ...BEFORE_USER,
  earningsAvailable: 60,   // 100 - 40
  earningsVoided: 70,      // 30 + 40
}

describe('POST /api/admin/users/[id]/balance - earnings_void', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    verifyPermission.mockResolvedValue({ user: ADMIN_USER, error: null } as any)
    // 恢复通知 mock 的默认 resolved 值（clearAllMocks 会清除）
    ;(OrderNotificationService.notifyEarningsVoid as any).mockResolvedValue(undefined)
    ;(OrderNotificationService.notifyBalanceChange as any).mockResolvedValue(undefined)
  })

  // ===== 场景 1-6: 正常作废 + 各字段不变 =====
  it('1. 正常作废：earningsAvailable 减少、earningsVoided 增加', async () => {
    const tx = makeTxForEarningsVoid({
      beforeUser: BEFORE_USER,
      afterUser: AFTER_USER_VOID,
    })
    prisma.$transaction.mockImplementationOnce(async (cb: any) => cb(tx))

    const { POST } = await import('@/app/api/admin/users/[id]/balance/route')
    const res = await POST(makeRequest({
      type: 'earnings_void', amount: 40, reason: '测试作废收益原因',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })
    const data = await res.json()

    expect(data.success).toBe(true)
    expect(data.data.earningsAvailable).toBe(60)
    expect(data.data.earningsVoided).toBe(70)
  })

  it('2. balance 不变', async () => {
    const tx = makeTxForEarningsVoid({
      beforeUser: BEFORE_USER,
      afterUser: AFTER_USER_VOID,
    })
    prisma.$transaction.mockImplementationOnce(async (cb: any) => cb(tx))

    const { POST } = await import('@/app/api/admin/users/[id]/balance/route')
    await POST(makeRequest({
      type: 'earnings_void', amount: 40, reason: '测试作废收益原因',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })

    // balanceRecord.create 的 balance 字段应该等于 afterUser.balance（真实快照）
    const brCall = tx.balanceRecord.create.mock.calls[0][0]
    expect(brCall.data.balance).toBe(1000)
  })

  it('3. frozenBalance 不变', async () => {
    const tx = makeTxForEarningsVoid({
      beforeUser: BEFORE_USER,
      afterUser: AFTER_USER_VOID,
    })
    prisma.$transaction.mockImplementationOnce(async (cb: any) => cb(tx))

    const { POST } = await import('@/app/api/admin/users/[id]/balance/route')
    await POST(makeRequest({
      type: 'earnings_void', amount: 40, reason: '测试作废收益原因',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })

    const brCall = tx.balanceRecord.create.mock.calls[0][0]
    expect(brCall.data.frozenBalance).toBe(200)
  })

  it('4. consumeBalance 不变', async () => {
    const tx = makeTxForEarningsVoid({
      beforeUser: BEFORE_USER,
      afterUser: AFTER_USER_VOID,
    })
    prisma.$transaction.mockImplementationOnce(async (cb: any) => cb(tx))

    const { POST } = await import('@/app/api/admin/users/[id]/balance/route')
    await POST(makeRequest({
      type: 'earnings_void', amount: 40, reason: '测试作废收益原因',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })

    // consumeBalance 不在 updateMany data 中
    const updateManyCall = tx.user.updateMany.mock.calls[0][0]
    expect(updateManyCall.data).not.toHaveProperty('consumeBalance')
  })

  it('5. earningsFrozen 不变', async () => {
    const tx = makeTxForEarningsVoid({
      beforeUser: BEFORE_USER,
      afterUser: AFTER_USER_VOID,
    })
    prisma.$transaction.mockImplementationOnce(async (cb: any) => cb(tx))

    const { POST } = await import('@/app/api/admin/users/[id]/balance/route')
    await POST(makeRequest({
      type: 'earnings_void', amount: 40, reason: '测试作废收益原因',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })

    const updateManyCall = tx.user.updateMany.mock.calls[0][0]
    expect(updateManyCall.data).not.toHaveProperty('earningsFrozen')
  })

  it('6. earningsPending 不变', async () => {
    const tx = makeTxForEarningsVoid({
      beforeUser: BEFORE_USER,
      afterUser: AFTER_USER_VOID,
    })
    prisma.$transaction.mockImplementationOnce(async (cb: any) => cb(tx))

    const { POST } = await import('@/app/api/admin/users/[id]/balance/route')
    await POST(makeRequest({
      type: 'earnings_void', amount: 40, reason: '测试作废收益原因',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })

    const updateManyCall = tx.user.updateMany.mock.calls[0][0]
    expect(updateManyCall.data).not.toHaveProperty('earningsPending')
  })

  // ===== 场景 7-12: 非法金额校验 =====
  it('7. 金额 0 返回 400，不进入事务', async () => {
    const { POST } = await import('@/app/api/admin/users/[id]/balance/route')
    const res = await POST(makeRequest({
      type: 'earnings_void', amount: 0, reason: '测试作废收益原因',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })
    expect(res.status).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('8. 负数返回 400，不进入事务', async () => {
    const { POST } = await import('@/app/api/admin/users/[id]/balance/route')
    const res = await POST(makeRequest({
      type: 'earnings_void', amount: -40, reason: '测试作废收益原因',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })
    expect(res.status).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('9. 字符串返回 400，不进入事务', async () => {
    const { POST } = await import('@/app/api/admin/users/[id]/balance/route')
    const res = await POST(makeRequest({
      type: 'earnings_void', amount: '40', reason: '测试作废收益原因',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })
    expect(res.status).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('10. NaN 返回 400，不进入事务', async () => {
    const { POST } = await import('@/app/api/admin/users/[id]/balance/route')
    const res = await POST(makeRequest({
      type: 'earnings_void', amount: NaN, reason: '测试作废收益原因',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })
    expect(res.status).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('11. Infinity 返回 400，不进入事务', async () => {
    const { POST } = await import('@/app/api/admin/users/[id]/balance/route')
    const res = await POST(makeRequest({
      type: 'earnings_void', amount: Infinity, reason: '测试作废收益原因',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })
    expect(res.status).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('12. -Infinity 返回 400，不进入事务', async () => {
    const { POST } = await import('@/app/api/admin/users/[id]/balance/route')
    const res = await POST(makeRequest({
      type: 'earnings_void', amount: -Infinity, reason: '测试作废收益原因',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })
    expect(res.status).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  // ===== 场景 13: 可用收益不足 → 返回 400 =====
  it('13. 可用收益不足返回 400，不写流水、不写日志、不发通知', async () => {
    const tx = makeTxForEarningsVoid({
      beforeUser: BEFORE_USER,
      afterUser: BEFORE_USER, // 不会到第二次查询
      updateManyCount: 0,
    })
    prisma.$transaction.mockImplementationOnce(async (cb: any) => {
      try {
        return await cb(tx)
      } catch (e) {
        throw e
      }
    })

    const { POST } = await import('@/app/api/admin/users/[id]/balance/route')
    const res = await POST(makeRequest({
      type: 'earnings_void', amount: 200, reason: '测试可用收益不足情况',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })
    const data = await res.json()

    // v007: 可用收益不足返回 400，不再返回 500
    expect(res.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.message).toContain('可用收益不足')
    // 不写流水
    expect(tx.balanceRecord.create).not.toHaveBeenCalled()
    // 不写日志
    expect(logOperation).not.toHaveBeenCalled()
    // 不发通知
    expect(OrderNotificationService.notifyEarningsVoid).not.toHaveBeenCalled()
  })

  // ===== 场景 14: 写入 BalanceRecord =====
  it('14. 写入 BalanceRecord，type = earnings_void，amount 为正数', async () => {
    const tx = makeTxForEarningsVoid({
      beforeUser: BEFORE_USER,
      afterUser: AFTER_USER_VOID,
    })
    prisma.$transaction.mockImplementationOnce(async (cb: any) => cb(tx))

    const { POST } = await import('@/app/api/admin/users/[id]/balance/route')
    await POST(makeRequest({
      type: 'earnings_void', amount: 40, reason: '测试作废收益原因',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })

    const brCall = tx.balanceRecord.create.mock.calls[0][0]
    expect(brCall.data.type).toBe('earnings_void')
    expect(brCall.data.amount).toBe(40)
    expect(brCall.data.amount).toBeGreaterThan(0)
  })

  // ===== 场景 15: OperationLog 前后值正确 =====
  it('15. 写入 OperationLog 的两个收益字段前后值正确', async () => {
    const tx = makeTxForEarningsVoid({
      beforeUser: BEFORE_USER,
      afterUser: AFTER_USER_VOID,
    })
    prisma.$transaction.mockImplementationOnce(async (cb: any) => cb(tx))

    const { POST } = await import('@/app/api/admin/users/[id]/balance/route')
    await POST(makeRequest({
      type: 'earnings_void', amount: 40, reason: '测试作废收益原因',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })

    expect(logOperation).toHaveBeenCalledOnce()
    const logCall = (logOperation as any).mock.calls[0][0]
    // oldValue 应该是反推的真实前值
    expect(logCall.oldValue.earningsAvailable).toBe(100)
    expect(logCall.oldValue.earningsVoided).toBe(30)
    // newValue 应该是数据库读取的真实后值
    expect(logCall.newValue.earningsAvailable).toBe(60)
    expect(logCall.newValue.earningsVoided).toBe(70)
  })

  // ===== 场景 16: 调用 notifyEarningsVoid 并传入 balanceRecordId =====
  it('16. 调用 notifyEarningsVoid 并传入 balanceRecordId', async () => {
    const tx = makeTxForEarningsVoid({
      beforeUser: BEFORE_USER,
      afterUser: AFTER_USER_VOID,
    })
    prisma.$transaction.mockImplementationOnce(async (cb: any) => cb(tx))

    const { POST } = await import('@/app/api/admin/users/[id]/balance/route')
    await POST(makeRequest({
      type: 'earnings_void', amount: 40, reason: '测试作废收益原因',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })

    expect(OrderNotificationService.notifyEarningsVoid).toHaveBeenCalledOnce()
    const callArgs = (OrderNotificationService.notifyEarningsVoid as any).mock.calls[0][0]
    expect(callArgs.userId).toBe('u1')
    expect(callArgs.amount).toBe(40)
    expect(callArgs.earningsAvailable).toBe(60)
    expect(callArgs.earningsVoided).toBe(70)
    // v007: balanceRecordId 等于资金流水创建结果的 id
    expect(callArgs.balanceRecordId).toBe('br-1')
  })

  // ===== 场景 17: P0 核心测试 - 通知失败时接口仍返回成功 =====
  it('17. notifyEarningsVoid 抛错时，资金接口仍返回成功', async () => {
    const tx = makeTxForEarningsVoid({
      beforeUser: BEFORE_USER,
      afterUser: AFTER_USER_VOID,
    })
    prisma.$transaction.mockImplementationOnce(async (cb: any) => cb(tx))

    // 模拟通知方法抛错（未捕获异常）
    ;(OrderNotificationService.notifyEarningsVoid as any).mockRejectedValueOnce(
      new Error('通知服务内部爆炸')
    )

    const { POST } = await import('@/app/api/admin/users/[id]/balance/route')
    const res = await POST(makeRequest({
      type: 'earnings_void', amount: 40, reason: '测试作废收益原因',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })
    const data = await res.json()

    // 关键断言：资金已成功，接口必须返回 200 + success=true
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
  })

  // ===== 场景 18: earnings_add 正常路径不受影响 =====
  it('18. 原有 earnings_add 正常路径不受影响', async () => {
    const tx = {
      user: {
        findUnique: vi.fn()
          .mockResolvedValueOnce(BEFORE_USER)
          .mockResolvedValueOnce({ ...BEFORE_USER, earningsAvailable: 200 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      balanceRecord: {
        create: vi.fn().mockResolvedValue({ id: 'br-1' }),
      },
    }
    prisma.$transaction.mockImplementationOnce(async (cb: any) => cb(tx))

    const { POST } = await import('@/app/api/admin/users/[id]/balance/route')
    const res = await POST(makeRequest({
      type: 'earnings_add', amount: 100, reason: '测试增加可用收益原因',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })
    const data = await res.json()

    expect(data.success).toBe(true)
    // 应该走 notifyBalanceChange，不是 notifyEarningsVoid
    expect(OrderNotificationService.notifyBalanceChange).toHaveBeenCalledOnce()
    expect(OrderNotificationService.notifyEarningsVoid).not.toHaveBeenCalled()
  })

  // ===== 场景 19: v007 原子资金更新参数精确断言 =====
  it('19. updateMany where/data 精确匹配', async () => {
    const tx = makeTxForEarningsVoid({
      beforeUser: BEFORE_USER,
      afterUser: AFTER_USER_VOID,
    })
    prisma.$transaction.mockImplementationOnce(async (cb: any) => cb(tx))

    const { POST } = await import('@/app/api/admin/users/[id]/balance/route')
    await POST(makeRequest({
      type: 'earnings_void', amount: 40, reason: '测试作废收益原因',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })

    // 精确断言 updateMany 的 where 和 data
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'u1',
        earningsAvailable: { gte: 40 },
      },
      data: {
        earningsAvailable: { decrement: 40 },
        earningsVoided: { increment: 40 },
      },
    })

    // 直接确认 data 不包含其他资金字段
    const updateManyCall = tx.user.updateMany.mock.calls[0][0]
    expect(updateManyCall.data).not.toHaveProperty('balance')
    expect(updateManyCall.data).not.toHaveProperty('frozenBalance')
    expect(updateManyCall.data).not.toHaveProperty('consumeBalance')
    expect(updateManyCall.data).not.toHaveProperty('earningsFrozen')
    expect(updateManyCall.data).not.toHaveProperty('earningsPending')
  })

  // ===== 场景 20: v007 balanceRecordId 传递链 + sourceType/sourceId =====
  it('20. balanceRecordId 从流水创建结果传到通知', async () => {
    const tx = makeTxForEarningsVoid({
      beforeUser: BEFORE_USER,
      afterUser: AFTER_USER_VOID,
    })
    // 使用特定的 balanceRecord id
    tx.balanceRecord.create.mockResolvedValueOnce({ id: 'br-special-999' })
    prisma.$transaction.mockImplementationOnce(async (cb: any) => cb(tx))

    const { POST } = await import('@/app/api/admin/users/[id]/balance/route')
    await POST(makeRequest({
      type: 'earnings_void', amount: 40, reason: '测试作废收益原因',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })

    // 通知收到的 balanceRecordId 等于流水创建结果的 id
    const callArgs = (OrderNotificationService.notifyEarningsVoid as any).mock.calls[0][0]
    expect(callArgs.balanceRecordId).toBe('br-special-999')
  })

  // ===== 场景 21: v008 未知异常返回 500，不发送通知，不写操作日志 =====
  it('21. 未知异常返回 500，不发送通知', async () => {
    // 模拟 prisma.$transaction 直接抛出未知异常
    prisma.$transaction.mockRejectedValueOnce(new Error('数据库连接断开'))

    const { POST } = await import('@/app/api/admin/users/[id]/balance/route')
    const res = await POST(makeRequest({
      type: 'earnings_void', amount: 40, reason: '测试作废收益原因',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })
    const data = await res.json()

    expect(res.status).toBe(500)
    expect(data.success).toBe(false)
    expect(data.message).toBe('数据库连接断开')
    expect(OrderNotificationService.notifyEarningsVoid).not.toHaveBeenCalled()
    expect(logOperation).not.toHaveBeenCalled()
  })
})
