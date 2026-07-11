import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/utils/admin-auth', () => ({
  verifyPermission: vi.fn(),
}))

// mock 整个 service 模块（必须导出 RechargeSettingsValidationError，否则 route 拿不到）
vi.mock('@/lib/services/recharge-settings.service', () => {
  class RechargeSettingsValidationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'RechargeSettingsValidationError'
    }
  }
  return {
    RechargeSettingsService: {
      getSettings: vi.fn(),
      updateSettings: vi.fn(),
    },
    RechargeSettingsValidationError,
  }
})

vi.mock('@/lib/utils/operation-log', () => ({
  logOperation: vi.fn().mockResolvedValue(undefined),
}))

// mock 日志模块（系统异常需要记录 logger.error）
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { verifyPermission } from '@/lib/utils/admin-auth'
import { RechargeSettingsService, RechargeSettingsValidationError } from '@/lib/services/recharge-settings.service'
import { logOperation } from '@/lib/utils/operation-log'
import { logger } from '@/lib/logger'

const buildAdmin = (role: string) => ({ id: 'admin-1', role, phone: '13900000000' } as any)

describe('/api/admin/recharge-settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ============ GET ============
  describe('GET', () => {
    it('GET 只请求 super_admin 和 finance_admin 权限（拒绝 auditor / support_admin / goods_admin）', async () => {
      verifyPermission.mockResolvedValueOnce({ user: null, error: Response.json({ success: false, message: '权限不足' }, { status: 403 }) })
      // 注意：未授权路径不调 service，不预设 mock（避免 mockResolvedValueOnce 残留到下一条测试）

      const { GET } = await import('@/app/api/admin/recharge-settings/route')
      const req = new Request('http://localhost/api/admin/recharge-settings')
      await GET(req as any)

      // 验证 verifyPermission 被调用，allowedRoles 包含 super_admin 和 finance_admin，不含其他角色
      expect(verifyPermission).toHaveBeenCalledTimes(1)
      const allowedRoles = (verifyPermission.mock.calls[0] as any)[1] as string[]
      expect(allowedRoles).toContain('super_admin')
      expect(allowedRoles).toContain('finance_admin')
      // 明确排除其他角色
      expect(allowedRoles).not.toContain('auditor')
      expect(allowedRoles).not.toContain('support_admin')
      expect(allowedRoles).not.toContain('goods_admin')
    })

    it('GET 返回充值设置白名单结构（success + data）', async () => {
      // 全部 9 个键都填值，便于验证响应 data 的完整字段集合
      const mockSettings = {
        enabled: false,
        qrCodeUrl: 'https://example.com/qr.png',
        qrCodeLabel: '平台充值二维码',
        payeeName: '测试收款人',
        minAmount: 1,
        maxAmount: 50000,
        instruction: '请扫码完成付款',
        contactPhone: '13800138000',
        serviceTime: '09:00-21:00',
      }
      verifyPermission.mockResolvedValueOnce({ user: buildAdmin('super_admin'), error: null })
      RechargeSettingsService.getSettings.mockResolvedValueOnce(mockSettings as any)

      const { GET } = await import('@/app/api/admin/recharge-settings/route')
      const req = new Request('http://localhost/api/admin/recharge-settings')
      const res = await GET(req as any)
      const data = await res.json()

      expect(data.success).toBe(true)
      expect(data.data).toEqual(mockSettings)
      // data 字段必须是九个白名单键
      const dataKeys = Object.keys(data.data).sort()
      expect(dataKeys).toEqual(
        ['contactPhone', 'enabled', 'instruction', 'maxAmount', 'minAmount', 'payeeName', 'qrCodeLabel', 'qrCodeUrl', 'serviceTime'].sort()
      )
    })

    it('GET 未授权时直接返回权限错误（不调 service）', async () => {
      const errorResponse = Response.json({ success: false, message: '权限不足' }, { status: 403 })
      verifyPermission.mockResolvedValueOnce({ user: null, error: errorResponse })

      const { GET } = await import('@/app/api/admin/recharge-settings/route')
      const req = new Request('http://localhost/api/admin/recharge-settings')
      const res = await GET(req as any)

      expect(res.status).toBe(403)
      expect(RechargeSettingsService.getSettings).not.toHaveBeenCalled()
    })
  })

  // ============ PUT ============
  describe('PUT', () => {
    it('PUT 未授权时直接返回权限错误', async () => {
      const errorResponse = Response.json({ success: false, message: '权限不足' }, { status: 403 })
      verifyPermission.mockResolvedValueOnce({ user: null, error: errorResponse })

      const { PUT } = await import('@/app/api/admin/recharge-settings/route')
      const req = new Request('http://localhost/api/admin/recharge-settings', {
        method: 'PUT',
        body: JSON.stringify({ enabled: true }),
        headers: { 'content-type': 'application/json' },
      })
      const res = await PUT(req as any)

      expect(res.status).toBe(403)
      expect(RechargeSettingsService.updateSettings).not.toHaveBeenCalled()
      expect(logOperation).not.toHaveBeenCalled()
    })

    it('PUT 只向服务传入九个允许字段，忽略恶意额外字段（reward.referral_rate / paymentSecret）', async () => {
      verifyPermission.mockResolvedValueOnce({ user: buildAdmin('super_admin'), error: null })
      RechargeSettingsService.updateSettings.mockResolvedValueOnce({
        previous: {} as any,
        current: {} as any,
      })

      const maliciousBody = {
        enabled: true,
        qrCodeUrl: 'https://example.com/qr.png',
        qrCodeLabel: '平台充值二维码',
        payeeName: '测试收款人',
        minAmount: 1,
        maxAmount: 50000,
        instruction: '测试说明',
        contactPhone: '13800138000',
        serviceTime: '09:00-21:00',
        'reward.referral_rate': 1,
        paymentSecret: 'malicious',
      }

      const { PUT } = await import('@/app/api/admin/recharge-settings/route')
      const req = new Request('http://localhost/api/admin/recharge-settings', {
        method: 'PUT',
        body: JSON.stringify(maliciousBody),
        headers: { 'content-type': 'application/json' },
      })
      await PUT(req as any)

      expect(RechargeSettingsService.updateSettings).toHaveBeenCalledTimes(1)
      const inputArg = (RechargeSettingsService.updateSettings.mock.calls[0] as any)[0]

      // 验证 9 个允许字段都在
      const allowedKeys = ['enabled', 'qrCodeUrl', 'qrCodeLabel', 'payeeName', 'minAmount', 'maxAmount', 'instruction', 'contactPhone', 'serviceTime']
      for (const k of allowedKeys) {
        expect(inputArg).toHaveProperty(k)
      }
      // 验证恶意字段被剔除
      expect(inputArg).not.toHaveProperty('reward.referral_rate')
      expect(inputArg).not.toHaveProperty('paymentSecret')

      // 验证传给 service 的 input 键集合恰好是 9 个
      expect(Object.keys(inputArg).sort()).toEqual(allowedKeys.sort())
    })

    it('PUT 成功后写 UPDATE 类型的 finance 操作日志（带 previous/current + IP/UA）', async () => {
      verifyPermission.mockResolvedValueOnce({ user: buildAdmin('super_admin'), error: null })
      const previous = { enabled: false, qrCodeUrl: undefined, minAmount: 1, maxAmount: 50000 } as any
      const current = { enabled: true, qrCodeUrl: 'https://example.com/qr.png', minAmount: 1, maxAmount: 50000 } as any
      RechargeSettingsService.updateSettings.mockResolvedValueOnce({ previous, current })

      const { PUT } = await import('@/app/api/admin/recharge-settings/route')
      const req = new Request('http://localhost/api/admin/recharge-settings', {
        method: 'PUT',
        body: JSON.stringify({
          enabled: true,
          qrCodeUrl: 'https://example.com/qr.png',
          qrCodeLabel: '平台充值二维码',
          payeeName: '测试收款人',
          minAmount: 1,
          maxAmount: 50000,
          instruction: '测试说明',
          contactPhone: '13800138000',
          serviceTime: '09:00-21:00',
        }),
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '192.168.1.100, 10.0.0.1',
          'user-agent': 'Mozilla/5.0 Test',
        },
      })
      const res = await PUT(req as any)

      expect(res.status).toBe(200)
      expect(logOperation).toHaveBeenCalledTimes(1)
      expect(logOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          action: 'UPDATE',
          module: 'finance',
          targetId: 'recharge-settings',
          oldValue: previous,
          newValue: current,
          ip: '192.168.1.100',
          userAgent: 'Mozilla/5.0 Test',
        })
      )
    })

    // ============ 修复一：业务校验错误 vs 系统异常严格区分 ============

    it('业务校验错误（RechargeSettingsValidationError）返回 400 + 具体中文文案 + 不写操作日志', async () => {
      verifyPermission.mockResolvedValueOnce({ user: buildAdmin('super_admin'), error: null })
      // service 抛出 RechargeSettingsValidationError
      RechargeSettingsService.updateSettings.mockRejectedValueOnce(
        new RechargeSettingsValidationError('启用充值前请先上传充值二维码')
      )

      const { PUT } = await import('@/app/api/admin/recharge-settings/route')
      const req = new Request('http://localhost/api/admin/recharge-settings', {
        method: 'PUT',
        body: JSON.stringify({
          enabled: true,
          qrCodeUrl: undefined,
          qrCodeLabel: '平台充值二维码',
          payeeName: '测试收款人',
          minAmount: 1,
          maxAmount: 50000,
          instruction: '测试说明',
          contactPhone: '13800138000',
          serviceTime: '09:00-21:00',
        }),
        headers: { 'content-type': 'application/json' },
      })
      const res = await PUT(req as any)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.success).toBe(false)
      // 返回具体中文校验文案（不通用化）
      expect(data.error).toBe('启用充值前请先上传充值二维码')
      // 不写操作日志
      expect(logOperation).not.toHaveBeenCalled()
      // 不记录系统日志（业务校验是预期错误）
      expect(logger.error).not.toHaveBeenCalled()
    })

    it('服务抛出普通 Error（数据库/事务/未知）返回 500 + 通用文案 "保存充值设置失败"', async () => {
      verifyPermission.mockResolvedValueOnce({ user: buildAdmin('super_admin'), error: null })
      // 普通 Error（不是 RechargeSettingsValidationError）
      RechargeSettingsService.updateSettings.mockRejectedValueOnce(
        new Error('DB connection failed: ECONNREFUSED 127.0.0.1:5432')
      )

      const { PUT } = await import('@/app/api/admin/recharge-settings/route')
      const req = new Request('http://localhost/api/admin/recharge-settings', {
        method: 'PUT',
        body: JSON.stringify({
          enabled: true,
          qrCodeUrl: 'https://example.com/qr.png',
          qrCodeLabel: '平台充值二维码',
          payeeName: '测试收款人',
          minAmount: 1,
          maxAmount: 50000,
          instruction: '测试说明',
          contactPhone: '13800138000',
          serviceTime: '09:00-21:00',
        }),
        headers: { 'content-type': 'application/json' },
      })
      const res = await PUT(req as any)
      const data = await res.json()

      expect(res.status).toBe(500)
      expect(data.success).toBe(false)
      // 500 响应只返回通用文案，不暴露内部错误信息
      expect(data.error).toBe('保存充值设置失败')
      // 不写操作日志
      expect(logOperation).not.toHaveBeenCalled()
    })

    it('数据库 Prisma 异常（带 code/meta）返回 500 + 通用文案 + 不泄露内部信息', async () => {
      verifyPermission.mockResolvedValueOnce({ user: buildAdmin('super_admin'), error: null })
      // 模拟 Prisma 错误（含 code/meta）
      const prismaError: any = new Error('connect ECONNREFUSED 127.0.0.1:5432')
      prismaError.code = 'P1001'
      prismaError.meta = { database: 'mlm_platform', host: '127.0.0.1' }
      RechargeSettingsService.updateSettings.mockRejectedValueOnce(prismaError)

      const { PUT } = await import('@/app/api/admin/recharge-settings/route')
      const req = new Request('http://localhost/api/admin/recharge-settings', {
        method: 'PUT',
        body: JSON.stringify({
          enabled: true,
          qrCodeUrl: 'https://example.com/qr.png',
          qrCodeLabel: '平台充值二维码',
          payeeName: '测试收款人',
          minAmount: 1,
          maxAmount: 50000,
          instruction: '测试说明',
          contactPhone: '13800138000',
          serviceTime: '09:00-21:00',
        }),
        headers: { 'content-type': 'application/json' },
      })
      const res = await PUT(req as any)
      const data = await res.json()

      expect(res.status).toBe(500)
      expect(data.error).toBe('保存充值设置失败')
      // 关键安全断言：响应中不包含数据库连接信息
      expect(data.error).not.toContain('ECONNREFUSED')
      expect(data.error).not.toContain('P1001')
      expect(data.error).not.toContain('mlm_platform')
      expect(data.error).not.toContain('127.0.0.1')
      // 整个响应 JSON 也不应泄露
      const dataStr = JSON.stringify(data)
      expect(dataStr).not.toContain('ECONNREFUSED')
      expect(dataStr).not.toContain('127.0.0.1')
      expect(dataStr).not.toContain('P1001')
    })

    it('系统异常（500）时不写操作日志', async () => {
      verifyPermission.mockResolvedValueOnce({ user: buildAdmin('super_admin'), error: null })
      RechargeSettingsService.updateSettings.mockRejectedValueOnce(new Error('any system error'))

      const { PUT } = await import('@/app/api/admin/recharge-settings/route')
      const req = new Request('http://localhost/api/admin/recharge-settings', {
        method: 'PUT',
        body: JSON.stringify({
          enabled: true,
          qrCodeUrl: 'https://example.com/qr.png',
          qrCodeLabel: '平台充值二维码',
          payeeName: '测试收款人',
          minAmount: 1,
          maxAmount: 50000,
          instruction: '测试说明',
          contactPhone: '13800138000',
          serviceTime: '09:00-21:00',
        }),
        headers: { 'content-type': 'application/json' },
      })
      await PUT(req as any)

      expect(logOperation).not.toHaveBeenCalled()
    })

    it('系统异常（500）时调用 console.error', async () => {
      verifyPermission.mockResolvedValueOnce({ user: buildAdmin('super_admin'), error: null })
      const sysError = new Error('database unreachable')
      RechargeSettingsService.updateSettings.mockRejectedValueOnce(sysError)

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { PUT } = await import('@/app/api/admin/recharge-settings/route')
      const req = new Request('http://localhost/api/admin/recharge-settings', {
        method: 'PUT',
        body: JSON.stringify({
          enabled: true,
          qrCodeUrl: 'https://example.com/qr.png',
          qrCodeLabel: '平台充值二维码',
          payeeName: '测试收款人',
          minAmount: 1,
          maxAmount: 50000,
          instruction: '测试说明',
          contactPhone: '13800138000',
          serviceTime: '09:00-21:00',
        }),
        headers: { 'content-type': 'application/json' },
      })
      await PUT(req as any)

      expect(consoleSpy).toHaveBeenCalled()
      const calls = consoleSpy.mock.calls.map((c) => c.join(' '))
      // 至少有一次 console.error 调用提到错误
      const hasRelevantCall = calls.some((c) => c.includes('Update recharge settings') || c.includes('database unreachable'))
      expect(hasRelevantCall).toBe(true)

      consoleSpy.mockRestore()
    })

    it('系统异常（500）时调用 logger.error 并传入 Prisma code/meta', async () => {
      verifyPermission.mockResolvedValueOnce({ user: buildAdmin('super_admin'), error: null })
      const prismaError: any = new Error('db error')
      prismaError.code = 'P2002'
      prismaError.meta = { target: ['recharge.enabled'] }
      RechargeSettingsService.updateSettings.mockRejectedValueOnce(prismaError)

      const { PUT } = await import('@/app/api/admin/recharge-settings/route')
      const req = new Request('http://localhost/api/admin/recharge-settings', {
        method: 'PUT',
        body: JSON.stringify({
          enabled: true,
          qrCodeUrl: 'https://example.com/qr.png',
          qrCodeLabel: '平台充值二维码',
          payeeName: '测试收款人',
          minAmount: 1,
          maxAmount: 50000,
          instruction: '测试说明',
          contactPhone: '13800138000',
          serviceTime: '09:00-21:00',
        }),
        headers: { 'content-type': 'application/json' },
      })
      await PUT(req as any)

      expect(logger.error).toHaveBeenCalled()
      const call = (logger.error as any).mock.calls[0]
      const message = call[0]
      const meta = call[1]
      expect(message).toBe('保存充值设置失败')
      expect(meta).toHaveProperty('error')
      expect(meta.error).toContain('db error')
      expect(meta).toHaveProperty('code', 'P2002')
      expect(meta).toHaveProperty('meta')
      expect(meta.meta).toEqual({ target: ['recharge.enabled'] })
    })

    it('业务校验错误不记录 console.error（业务校验是预期错误）', async () => {
      verifyPermission.mockResolvedValueOnce({ user: buildAdmin('super_admin'), error: null })
      RechargeSettingsService.updateSettings.mockRejectedValueOnce(
        new RechargeSettingsValidationError('最高充值金额不能低于最低充值金额')
      )

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { PUT } = await import('@/app/api/admin/recharge-settings/route')
      const req = new Request('http://localhost/api/admin/recharge-settings', {
        method: 'PUT',
        body: JSON.stringify({
          enabled: false,
          qrCodeUrl: undefined,
          qrCodeLabel: '平台充值二维码',
          payeeName: '测试收款人',
          minAmount: 100,
          maxAmount: 50,
          instruction: '测试说明',
          contactPhone: '13800138000',
          serviceTime: '09:00-21:00',
        }),
        headers: { 'content-type': 'application/json' },
      })
      await PUT(req as any)

      // 业务校验错误 → 400 → 不打 console.error（不打系统日志）
      expect(consoleSpy).not.toHaveBeenCalled()

      consoleSpy.mockRestore()
    })
  })
})
