import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/points.service', () => ({
  PointsService: { dailyUnlock: vi.fn() },
}))

vi.mock('@/lib/services/order-lifecycle.service', () => ({
  OrderLifecycleService: { autoCompleteOrders: vi.fn() },
}))

vi.mock('@/lib/services/dividend.service', () => ({
  DividendService: {
    snapshotDailyDividends: vi.fn(),
    settleWeeklyDividends: vi.fn(),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { DividendService } from '@/lib/services/dividend.service'
import { logger } from '@/lib/logger'
import { runWeeklyTasks } from '@/lib/utils/cron'

describe('runWeeklyTasks - Batch 3A-1', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports settlement pause as paused and unsuccessful without throwing', async () => {
    const pausedResult = {
      paused: true,
      batchId: null,
      totalAmount: 0,
      totalDividends: 0,
      distributedUsers: 0,
      details: [],
      message: '分红结算维护中，当前未执行任何资金操作',
    }
    vi.mocked(DividendService.settleWeeklyDividends).mockResolvedValueOnce(pausedResult as any)

    const result = await runWeeklyTasks()

    expect(result.dividendSettle).toEqual({
      success: false,
      paused: true,
      data: pausedResult,
    })
    expect(logger.warn).toHaveBeenCalledWith(
      '[Batch 3A-1] 分红周结任务已暂停',
      { reason: pausedResult.message }
    )
    expect(logger.info).not.toHaveBeenCalledWith(
      '✅ 分红周结入账完成',
      expect.anything()
    )
  })

  it('fail-closed: treats result missing paused as paused', async () => {
    // 故意绕过类型系统模拟运行时 paused 缺失，测试 fail-closed
    const corruptedResult = {
      batchId: 'fake-batch',
      totalAmount: 999,
      totalDividends: 1,
      distributedUsers: 1,
      details: [{ userId: 'u1', amount: 999, dividendCount: 1 }],
      message: '周结分红入账成功（批次 fake-batch）',
    }
    vi.mocked(DividendService.settleWeeklyDividends).mockResolvedValueOnce(corruptedResult as any)

    const result = await runWeeklyTasks()

    expect(result.dividendSettle?.success).toBe(false)
    expect(result.dividendSettle?.paused).toBe(true)
    expect(logger.warn).toHaveBeenCalledWith(
      '[Batch 3A-1] 分红周结任务已暂停',
      { reason: '分红结算维护中，当前未执行任何资金操作' }
    )
    expect(logger.info).not.toHaveBeenCalledWith(
      '✅ 分红周结入账完成',
      expect.anything()
    )
  })
})