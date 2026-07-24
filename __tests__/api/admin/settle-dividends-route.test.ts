import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/utils/admin-auth', () => ({
  verifyPermission: vi.fn(),
}))

vi.mock('@/lib/services/dividend.service', () => ({
  DividendService: {
    settleWeeklyDividends: vi.fn(),
    snapshotDailyDividends: vi.fn(),
    getTodayDividendSummary: vi.fn(),
  },
}))

import { verifyPermission } from '@/lib/utils/admin-auth'
import { DividendService } from '@/lib/services/dividend.service'

const admin = { id: 'admin-1', role: 'finance_admin' } as any

function post(body: unknown) {
  return new Request('http://localhost/api/admin/settle-dividends', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/admin/settle-dividends - Batch 3A-1', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('preserves permission denial and does not call either operation', async () => {
    const denied = Response.json({ success: false, error: '权限不足' }, { status: 403 })
    vi.mocked(verifyPermission).mockResolvedValueOnce({ user: null, error: denied } as any)

    const { POST } = await import('@/app/api/admin/settle-dividends/route')
    const response = await POST(post({ action: 'settle' }) as any)

    expect(response.status).toBe(403)
    expect(DividendService.settleWeeklyDividends).not.toHaveBeenCalled()
    expect(DividendService.snapshotDailyDividends).not.toHaveBeenCalled()
  })

  it('returns 503 and explicit paused response for manual settlement', async () => {
    vi.mocked(verifyPermission).mockResolvedValueOnce({ user: admin, error: null } as any)
    vi.mocked(DividendService.settleWeeklyDividends).mockResolvedValueOnce({
      paused: true,
      batchId: null,
      totalAmount: 0,
      totalDividends: 0,
      distributedUsers: 0,
      details: [],
      message: '分红结算维护中，当前未执行任何资金操作',
    })

    const { POST } = await import('@/app/api/admin/settle-dividends/route')
    const response = await POST(post({ action: 'settle' }) as any)
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toEqual({
      success: false,
      paused: true,
      error: '分红结算维护中，当前未执行任何资金操作',
    })
    expect(DividendService.settleWeeklyDividends).toHaveBeenCalledTimes(1)
    expect(DividendService.snapshotDailyDividends).not.toHaveBeenCalled()
  })

  it('keeps snapshot behavior unchanged', async () => {
    vi.mocked(verifyPermission).mockResolvedValueOnce({ user: admin, error: null } as any)
    const snapshot = { message: '分红快照成功', distributedUsers: 2 }
    vi.mocked(DividendService.snapshotDailyDividends).mockResolvedValueOnce(snapshot as any)

    const { POST } = await import('@/app/api/admin/settle-dividends/route')
    const response = await POST(post({ action: 'snapshot' }) as any)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ success: true, data: snapshot })
    expect(DividendService.snapshotDailyDividends).toHaveBeenCalledTimes(1)
    expect(DividendService.settleWeeklyDividends).not.toHaveBeenCalled()
  })
})