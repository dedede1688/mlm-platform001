import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma before importing service
vi.mock('@/lib/prisma', () => {
  const mockSystemConfig = {
    findMany: vi.fn(),
    upsert: vi.fn(),
  }
  const mockPrisma: any = {
    systemConfig: mockSystemConfig,
    $transaction: vi.fn(),
  }
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
  return { prisma: mockPrisma }
})

vi.mock('@/lib/config/business', () => ({
  getBusinessConfig: vi.fn(),
  invalidateBusinessConfigCache: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { getBusinessConfig, invalidateBusinessConfigCache } from '@/lib/config/business'
import { RechargeSettingsService, RechargeSettingsValidationError } from '@/lib/services/recharge-settings.service'

describe('RechargeSettingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma))
  })

  // ============ getSettings ============
  describe('getSettings', () => {
    it('读取完整的单二维码充值设置：委托给 getBusinessConfig 按九个键读取', async () => {
      // 9 个 getBusinessConfig 调用：顺序按 plan 定义
      vi.mocked(getBusinessConfig).mockImplementation(async (key: string, defaultValue: any) => {
        const map: Record<string, any> = {
          'recharge.enabled': true,
          'recharge.qr_code_url': 'https://example.com/qr.png',
          'recharge.qr_code_label': '平台充值二维码',
          'recharge.payee_name': '测试收款人',
          'recharge.min_amount': 100,
          'recharge.max_amount': 10000,
          'recharge.instruction': '请扫码完成付款',
          'recharge.contact_phone': '13800138000',
          'recharge.service_time': '09:00-21:00',
        }
        return key in map ? map[key] : defaultValue
      })

      const settings = await RechargeSettingsService.getSettings()

      expect(settings).toEqual({
        enabled: true,
        qrCodeUrl: 'https://example.com/qr.png',
        qrCodeLabel: '平台充值二维码',
        payeeName: '测试收款人',
        minAmount: 100,
        maxAmount: 10000,
        instruction: '请扫码完成付款',
        contactPhone: '13800138000',
        serviceTime: '09:00-21:00',
      })

      // 验证调用了 9 次 getBusinessConfig
      expect(getBusinessConfig).toHaveBeenCalledTimes(9)

      // 验证键名集合（不重复）
      const calledKeys = vi.mocked(getBusinessConfig).mock.calls.map((c) => c[0])
      expect(new Set(calledKeys).size).toBe(9)
    })

    it('默认关闭充值且二维码为空：未配置时返回 enabled=false, qrCodeUrl=undefined', async () => {
      // 全部走 defaultValue
      vi.mocked(getBusinessConfig).mockImplementation(async (_key: string, defaultValue: any) => defaultValue)

      const settings = await RechargeSettingsService.getSettings()

      expect(settings.enabled).toBe(false)
      expect(settings.qrCodeUrl).toBeUndefined()
      expect(settings.payeeName).toBeUndefined()
      expect(settings.contactPhone).toBeUndefined()
      expect(settings.serviceTime).toBeUndefined()
      // 默认 minAmount=1, maxAmount=50000
      expect(settings.minAmount).toBe(1)
      expect(settings.maxAmount).toBe(50000)
      // instruction 默认文案
      expect(settings.instruction).toContain('请扫码')
    })

    // 修复四：可选空字段统一返回 undefined（不返回空字符串）
    it('getBusinessConfig 返回空字符串时，可选字段统一返回 undefined', async () => {
      // 模拟数据库里存了空字符串
      vi.mocked(getBusinessConfig).mockImplementation(async (key: string, defaultValue: any) => {
        const map: Record<string, any> = {
          'recharge.enabled': true,
          'recharge.qr_code_url': '',          // 空字符串
          'recharge.qr_code_label': '',         // 空字符串
          'recharge.payee_name': '',            // 空字符串
          'recharge.min_amount': 1,
          'recharge.max_amount': 50000,
          'recharge.instruction': '测试说明',
          'recharge.contact_phone': '',         // 空字符串
          'recharge.service_time': '   ',       // 纯空格（trim 后也归 undefined）
        }
        return key in map ? map[key] : defaultValue
      })

      const settings = await RechargeSettingsService.getSettings()

      // 五个可选字段必须全部是 undefined（不暴露空字符串）
      expect(settings.qrCodeUrl).toBeUndefined()
      expect(settings.qrCodeLabel).toBeUndefined()
      expect(settings.payeeName).toBeUndefined()
      expect(settings.contactPhone).toBeUndefined()
      expect(settings.serviceTime).toBeUndefined()
    })
  })

  // ============ updateSettings ============
  describe('updateSettings', () => {
    const baseInput = {
      enabled: true,
      qrCodeUrl: 'https://example.com/qr.png',
      qrCodeLabel: '平台充值二维码',
      payeeName: '测试收款人',
      minAmount: 1,
      maxAmount: 50000,
      instruction: '请扫码完成付款',
      contactPhone: '13800138000',
      serviceTime: '09:00-21:00',
    }

    beforeEach(() => {
      // 默认配置读取：返回当前配置（用于修改前快照）
      vi.mocked(getBusinessConfig).mockImplementation(async (_key: string, defaultValue: any) => defaultValue)
    })

    // ============ 修复一：所有校验失败必须是 RechargeSettingsValidationError ============

    it('启用充值但二维码为空时拒绝保存（抛 RechargeSettingsValidationError）', async () => {
      try {
        await RechargeSettingsService.updateSettings({
          ...baseInput,
          enabled: true,
          qrCodeUrl: undefined,
        })
        expect.fail('应该抛错')
      } catch (e: any) {
        expect(e).toBeInstanceOf(RechargeSettingsValidationError)
        expect(e.message).toBe('启用充值前请先上传充值二维码')
        expect(e.name).toBe('RechargeSettingsValidationError')
      }
    })

    it('二维码不是 https 地址时拒绝保存（抛 RechargeSettingsValidationError）', async () => {
      try {
        await RechargeSettingsService.updateSettings({
          ...baseInput,
          qrCodeUrl: 'http://example.com/qr.png',
        })
        expect.fail('应该抛错')
      } catch (e: any) {
        expect(e).toBeInstanceOf(RechargeSettingsValidationError)
        expect(e.message).toBe('充值二维码必须是已上传成功的 https 图片地址')
      }
    })

    it('二维码是 data:image base64 时拒绝保存（抛 RechargeSettingsValidationError）', async () => {
      try {
        await RechargeSettingsService.updateSettings({
          ...baseInput,
          qrCodeUrl: 'data:image/png;base64,iVBORw0KGgo...',
        })
        expect.fail('应该抛错')
      } catch (e: any) {
        expect(e).toBeInstanceOf(RechargeSettingsValidationError)
      }
    })

    it('最低金额不是有限正数（<=0）时拒绝保存（抛 RechargeSettingsValidationError）', async () => {
      for (const amount of [0, -1]) {
        try {
          await RechargeSettingsService.updateSettings({ ...baseInput, minAmount: amount })
          expect.fail(`amount=${amount} 应该抛错`)
        } catch (e: any) {
          expect(e).toBeInstanceOf(RechargeSettingsValidationError)
          expect(e.message).toBe('最低充值金额必须是大于 0 的有效数字')
        }
      }
    })

    it('最低金额是 NaN 时拒绝保存（抛 RechargeSettingsValidationError）', async () => {
      try {
        await RechargeSettingsService.updateSettings({ ...baseInput, minAmount: NaN })
        expect.fail('应该抛错')
      } catch (e: any) {
        expect(e).toBeInstanceOf(RechargeSettingsValidationError)
        expect(e.message).toBe('最低充值金额必须是大于 0 的有效数字')
      }
    })

    it('最低金额是 Infinity 时拒绝保存（抛 RechargeSettingsValidationError）', async () => {
      try {
        await RechargeSettingsService.updateSettings({ ...baseInput, minAmount: Infinity })
        expect.fail('应该抛错')
      } catch (e: any) {
        expect(e).toBeInstanceOf(RechargeSettingsValidationError)
        expect(e.message).toBe('最低充值金额必须是大于 0 的有效数字')
      }
    })

    it('最高金额小于最低金额时拒绝保存（抛 RechargeSettingsValidationError）', async () => {
      try {
        await RechargeSettingsService.updateSettings({
          ...baseInput,
          minAmount: 100,
          maxAmount: 50,
        })
        expect.fail('应该抛错')
      } catch (e: any) {
        expect(e).toBeInstanceOf(RechargeSettingsValidationError)
        expect(e.message).toBe('最高充值金额不能低于最低充值金额')
      }
    })

    it('最高金额不是有限正数时拒绝保存（抛 RechargeSettingsValidationError）', async () => {
      try {
        await RechargeSettingsService.updateSettings({ ...baseInput, maxAmount: -100 })
        expect.fail('应该抛错')
      } catch (e: any) {
        expect(e).toBeInstanceOf(RechargeSettingsValidationError)
        expect(e.message).toBe('最高充值金额必须是大于 0 的有效数字')
      }
    })

    it('充值说明为空时拒绝保存（抛 RechargeSettingsValidationError）', async () => {
      for (const instruction of ['', '   ']) {
        try {
          await RechargeSettingsService.updateSettings({ ...baseInput, instruction })
          expect.fail(`instruction="${instruction}" 应该抛错`)
        } catch (e: any) {
          expect(e).toBeInstanceOf(RechargeSettingsValidationError)
          expect(e.message).toBe('充值说明不能为空')
        }
      }
    })

    // ============ 修复三：数据库事务失败时 ============

    it('prisma.$transaction 抛错时，updateSettings 原样向上抛出原始异常', async () => {
      const dbError: any = new Error('connect ECONNREFUSED 127.0.0.1:5432')
      dbError.code = 'P1001'
      // mock 事务失败
      prisma.$transaction.mockImplementationOnce(async () => {
        throw dbError
      })

      let caught: any = null
      try {
        await RechargeSettingsService.updateSettings(baseInput)
      } catch (e) {
        caught = e
      }

      // 验证原始错误被原样抛出（不包装成业务校验错误）
      expect(caught).toBe(dbError)
      expect(caught.code).toBe('P1001')
      // 关键：不是 RechargeSettingsValidationError（数据库异常不能伪装成业务错误）
      expect(caught).not.toBeInstanceOf(RechargeSettingsValidationError)
    })

    it('prisma.$transaction 抛错时，不调用 invalidateBusinessConfigCache', async () => {
      prisma.$transaction.mockImplementationOnce(async () => {
        throw new Error('database transaction failed')
      })

      await expect(
        RechargeSettingsService.updateSettings(baseInput)
      ).rejects.toThrow('database transaction failed')

      // 关键：事务失败时**不清理缓存**（避免缓存与数据库不一致）
      expect(invalidateBusinessConfigCache).not.toHaveBeenCalled()
    })

    it('事务成功后才清除缓存（已存在断言保留）', async () => {
      await RechargeSettingsService.updateSettings(baseInput)

      // 关键：必须先 upsert 全部 9 个 key，事务返回后才调 invalidate
      expect(prisma.systemConfig.upsert).toHaveBeenCalledTimes(9)
      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
      expect(invalidateBusinessConfigCache).toHaveBeenCalledTimes(1)
    })

    // ============ 现有功能测试保留 ============

    it('只写入明确允许的九个充值配置键：所有 systemConfig.upsert 调用必须只涉及 9 个白名单 key', async () => {
      await RechargeSettingsService.updateSettings(baseInput)

      // 收集所有 upsert 的 key
      const calledKeys = prisma.systemConfig.upsert.mock.calls.map(
        (call) => (call[0] as any)?.where?.key as string
      )

      const allowedKeys = new Set([
        'recharge.enabled',
        'recharge.qr_code_url',
        'recharge.qr_code_label',
        'recharge.payee_name',
        'recharge.min_amount',
        'recharge.max_amount',
        'recharge.instruction',
        'recharge.contact_phone',
        'recharge.service_time',
      ])

      expect(calledKeys.length).toBe(9)
      calledKeys.forEach((k) => {
        expect(allowedKeys.has(k)).toBe(true)
      })
    })

    it('在同一事务中保存全部配置：upsert 全部通过 tx.systemConfig.upsert 调用', async () => {
      await RechargeSettingsService.updateSettings(baseInput)

      // 全部 9 次 upsert 都应该走 prisma.$transaction 内部的 tx
      // 由于 mock $transaction = async (fn) => fn(prisma)，所以全部走 prisma.systemConfig.upsert
      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
      expect(prisma.systemConfig.upsert).toHaveBeenCalledTimes(9)
    })

    it('返回修改前和修改后的配置快照', async () => {
      // 修改前：默认 enabled=false, qrCodeUrl=undefined
      vi.mocked(getBusinessConfig).mockImplementation(async (_key: string, defaultValue: any) => defaultValue)

      const result = await RechargeSettingsService.updateSettings(baseInput)

      expect(result.previous.enabled).toBe(false)
      expect(result.previous.qrCodeUrl).toBeUndefined()

      expect(result.current.enabled).toBe(true)
      expect(result.current.qrCodeUrl).toBe('https://example.com/qr.png')
      expect(result.current.payeeName).toBe('测试收款人')
    })

    it('文本字段保存前去除首尾空格', async () => {
      const trimmed = await RechargeSettingsService.updateSettings({
        ...baseInput,
        qrCodeLabel: '  平台充值二维码  ',
        payeeName: '  测试收款人  ',
        instruction: '  请扫码完成付款  ',
        contactPhone: '  13800138000  ',
        serviceTime: '  09:00-21:00  ',
      })

      // 验证保存到 db 的值是 trim 后的
      const upsertCalls = prisma.systemConfig.upsert.mock.calls
      const instructionCall = upsertCalls.find((c) => (c[0] as any)?.where?.key === 'recharge.instruction')
      expect((instructionCall![0] as any).update.value).toBe('请扫码完成付款')

      // 验证返回的 current 也是 trim 后的
      expect(trimmed.current.qrCodeLabel).toBe('平台充值二维码')
      expect(trimmed.current.payeeName).toBe('测试收款人')
      expect(trimmed.current.instruction).toBe('请扫码完成付款')
      expect(trimmed.current.contactPhone).toBe('13800138000')
      expect(trimmed.current.serviceTime).toBe('09:00-21:00')
    })

    it('保存空文本字段 → 存为空字符串，读取时规范为 undefined（不污染数据库）', async () => {
      await RechargeSettingsService.updateSettings({
        ...baseInput,
        qrCodeUrl: undefined,
        qrCodeLabel: undefined,
        payeeName: undefined,
        contactPhone: undefined,
        serviceTime: undefined,
        // enabled 设为 false 避免"启用但无二维码"校验
        enabled: false,
      })

      // 所有可选文本字段存为空字符串
      const upsertCalls = prisma.systemConfig.upsert.mock.calls
      const qrCodeUrlCall = upsertCalls.find((c) => (c[0] as any)?.where?.key === 'recharge.qr_code_url')
      expect((qrCodeUrlCall![0] as any).update.value).toBe('')
    })

    it('关闭充值不要求二维码（enabled=false 时可以没有二维码）', async () => {
      // 关键业务红线：默认 disabled 状态下允许没有二维码
      const result = await RechargeSettingsService.updateSettings({
        ...baseInput,
        enabled: false,
        qrCodeUrl: undefined,
      })

      expect(result.current.enabled).toBe(false)
      expect(result.current.qrCodeUrl).toBeUndefined()
    })
  })
})
