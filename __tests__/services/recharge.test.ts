import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma before importing service
vi.mock('@/lib/prisma', () => {
  const createMockChain = () => ({
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
  })

  const mockPrisma: any = {
    user: createMockChain(),
    rechargeRequest: createMockChain(),
    rechargeAuditLog: createMockChain(),
    balanceRecord: createMockChain(),
    systemConfig: createMockChain(),
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  }
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
  return { prisma: mockPrisma }
})

vi.mock('@/lib/config/business', () => ({
  getBusinessConfig: vi.fn().mockImplementation(async (_key: string, defaultValue: any) => defaultValue),
  invalidateBusinessConfigCache: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { RechargeService } from '@/lib/services/recharge.service'

describe('RechargeService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma))
  })

  // ============ createRechargeRequest ============
  describe('createRechargeRequest', () => {
    it('should create recharge request successfully', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1' })
      prisma.rechargeRequest.create.mockResolvedValueOnce({
        id: 'r1', userId: 'u1', amount: 500, status: 'pending',
        paymentMethod: 'alipay', paymentProofUrl: 'https://example.com/proof.png',
      })
      prisma.rechargeAuditLog.create.mockResolvedValueOnce({ id: 'a1' })

      const result = await RechargeService.createRechargeRequest('u1', {
        amount: 500,
        paymentMethod: 'alipay',
        paymentProofUrl: 'https://example.com/proof.png',
      })

      expect(result).toBeDefined()
      expect(result.status).toBe('pending')
      expect(result.amount).toBe(500)

      // 验证创建的充值申请
      expect(prisma.rechargeRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'u1',
            amount: 500,
            paymentMethod: 'alipay',
            paymentProofUrl: 'https://example.com/proof.png',
            status: 'pending',
          }),
        })
      )

      // 验证写了审核日志
      expect(prisma.rechargeAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'submit',
            newStatus: 'pending',
            operatorId: 'u1',
          }),
        })
      )
    })

    it('throws "充值金额必须为有效数字且大于0" when amount <= 0', async () => {
      await expect(
        RechargeService.createRechargeRequest('u1', {
          amount: 0,
          paymentMethod: 'alipay',
          paymentProofUrl: 'https://example.com/proof.png',
        })
      ).rejects.toThrow('充值金额必须为有效数字且大于0')

      await expect(
        RechargeService.createRechargeRequest('u1', {
          amount: -100,
          paymentMethod: 'alipay',
          paymentProofUrl: 'https://example.com/proof.png',
        })
      ).rejects.toThrow('充值金额必须为有效数字且大于0')
    })

    it('throws "充值金额必须为有效数字且大于0" when amount is a string', async () => {
      await expect(
        RechargeService.createRechargeRequest('u1', {
          amount: '100' as any,
          paymentMethod: 'alipay',
          paymentProofUrl: 'https://example.com/proof.png',
        })
      ).rejects.toThrow('充值金额必须为有效数字且大于0')
    })

    it('throws "充值金额必须为有效数字且大于0" when amount is NaN', async () => {
      await expect(
        RechargeService.createRechargeRequest('u1', {
          amount: NaN,
          paymentMethod: 'alipay',
          paymentProofUrl: 'https://example.com/proof.png',
        })
      ).rejects.toThrow('充值金额必须为有效数字且大于0')
    })

    it('throws "充值金额必须为有效数字且大于0" when amount is Infinity', async () => {
      await expect(
        RechargeService.createRechargeRequest('u1', {
          amount: Infinity,
          paymentMethod: 'alipay',
          paymentProofUrl: 'https://example.com/proof.png',
        })
      ).rejects.toThrow('充值金额必须为有效数字且大于0')
    })

    it('throws "请上传付款凭证" when paymentProofUrl missing', async () => {
      await expect(
        RechargeService.createRechargeRequest('u1', {
          amount: 100,
          paymentMethod: 'alipay',
          paymentProofUrl: '',
        })
      ).rejects.toThrow('请上传付款凭证')
    })

    it('throws "请上传付款凭证" when paymentProofUrl is whitespace', async () => {
      await expect(
        RechargeService.createRechargeRequest('u1', {
          amount: 100,
          paymentMethod: 'alipay',
          paymentProofUrl: '   ',
        })
      ).rejects.toThrow('请上传付款凭证')
    })

    it('throws "付款凭证链接必须为 https:// 开头" when paymentProofUrl is not https', async () => {
      await expect(
        RechargeService.createRechargeRequest('u1', {
          amount: 100,
          paymentMethod: 'alipay',
          paymentProofUrl: 'http://example.com/proof.png',
        })
      ).rejects.toThrow('付款凭证链接必须为 https:// 开头')
    })

    it('throws "请选择有效的支付方式" when paymentMethod is invalid', async () => {
      await expect(
        RechargeService.createRechargeRequest('u1', {
          amount: 100,
          paymentMethod: 'paypal',
          paymentProofUrl: 'https://example.com/proof.png',
        })
      ).rejects.toThrow('请选择有效的支付方式')
    })

    it('throws "请选择有效的支付方式" when paymentMethod is empty', async () => {
      await expect(
        RechargeService.createRechargeRequest('u1', {
          amount: 100,
          paymentMethod: '',
          paymentProofUrl: 'https://example.com/proof.png',
        })
      ).rejects.toThrow('请选择有效的支付方式')
    })

    it('throws "用户不存在" when user not found', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null)

      await expect(
        RechargeService.createRechargeRequest('u-nonexistent', {
          amount: 100,
          paymentMethod: 'alipay',
          paymentProofUrl: 'https://example.com/proof.png',
        })
      ).rejects.toThrow('用户不存在')
    })

    it('throws "最低充值金额" when amount < minAmount', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1' })

      await expect(
        RechargeService.createRechargeRequest('u1', {
          amount: 0.5,
          paymentMethod: 'alipay',
          paymentProofUrl: 'https://example.com/proof.png',
        })
      ).rejects.toThrow('最低充值金额')
    })

    it('throws "单笔最高充值金额" when amount > maxAmount', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1' })

      await expect(
        RechargeService.createRechargeRequest('u1', {
          amount: 60000,
          paymentMethod: 'alipay',
          paymentProofUrl: 'https://example.com/proof.png',
        })
      ).rejects.toThrow('单笔最高充值金额')
    })

    it('提交申请不修改 balance / consumeBalance / earningsAvailable / earningsFrozen', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1' })
      prisma.rechargeRequest.create.mockResolvedValueOnce({
        id: 'r1', userId: 'u1', amount: 500, status: 'pending',
      })
      prisma.rechargeAuditLog.create.mockResolvedValueOnce({ id: 'a1' })

      await RechargeService.createRechargeRequest('u1', {
        amount: 500,
        paymentMethod: 'wechat',
        paymentProofUrl: 'https://example.com/proof.png',
      })

      // 验证没有调用 user.updateMany（不修改用户资金字段）
      expect(prisma.user.updateMany).not.toHaveBeenCalled()
    })

    it('提交申请不写 BalanceRecord', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1' })
      prisma.rechargeRequest.create.mockResolvedValueOnce({
        id: 'r1', userId: 'u1', amount: 500, status: 'pending',
      })
      prisma.rechargeAuditLog.create.mockResolvedValueOnce({ id: 'a1' })

      await RechargeService.createRechargeRequest('u1', {
        amount: 500,
        paymentMethod: 'bank_card',
        paymentProofUrl: 'https://example.com/proof.png',
      })

      // 验证没有写 balanceRecord
      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
    })

    it('accepts all three valid payment methods', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' })
      prisma.rechargeRequest.create.mockResolvedValue({
        id: 'r1', status: 'pending',
      })
      prisma.rechargeAuditLog.create.mockResolvedValue({ id: 'a1' })

      for (const method of ['alipay', 'wechat', 'bank_card']) {
        await RechargeService.createRechargeRequest('u1', {
          amount: 100,
          paymentMethod: method,
          paymentProofUrl: 'https://example.com/proof.png',
        })
      }

      // 验证 3 次都成功创建
      expect(prisma.rechargeRequest.create).toHaveBeenCalledTimes(3)
    })

    it('trims paymentProofUrl whitespace', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1' })
      prisma.rechargeRequest.create.mockResolvedValueOnce({
        id: 'r1', status: 'pending',
      })
      prisma.rechargeAuditLog.create.mockResolvedValueOnce({ id: 'a1' })

      await RechargeService.createRechargeRequest('u1', {
        amount: 100,
        paymentMethod: 'alipay',
        paymentProofUrl: '  https://example.com/proof.png  ',
      })

      expect(prisma.rechargeRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentProofUrl: 'https://example.com/proof.png',
          }),
        })
      )
    })
  })

  // ============ getUserRechargeRequests ============
  describe('getUserRechargeRequests', () => {
    it('returns paginated recharge requests for user', async () => {
      prisma.rechargeRequest.findMany.mockResolvedValueOnce([
        { id: 'r1', amount: 100, status: 'pending' },
      ] as any)
      prisma.rechargeRequest.count.mockResolvedValueOnce(1)

      const result = await RechargeService.getUserRechargeRequests('user-1')
      expect(result.requests).toHaveLength(1)
      expect(result.pagination.total).toBe(1)
      expect(result.pagination.totalPages).toBe(1)
    })

    it('uses custom page and limit', async () => {
      prisma.rechargeRequest.findMany.mockResolvedValueOnce([])
      prisma.rechargeRequest.count.mockResolvedValueOnce(100)

      const result = await RechargeService.getUserRechargeRequests('user-1', 3, 10)
      expect(result.pagination.page).toBe(3)
      expect(result.pagination.totalPages).toBe(10)
    })

    it('queries only by userId (user isolation)', async () => {
      prisma.rechargeRequest.findMany.mockResolvedValueOnce([])
      prisma.rechargeRequest.count.mockResolvedValueOnce(0)

      await RechargeService.getUserRechargeRequests('user-1')

      expect(prisma.rechargeRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
        })
      )
    })
  })

  // ============ getUserRechargeRequestById ============
  describe('getUserRechargeRequestById', () => {
    it('returns recharge request when it belongs to the user', async () => {
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', userId: 'user-1', amount: 100, status: 'pending',
      })

      const result = await RechargeService.getUserRechargeRequestById('user-1', 'r1')
      expect(result).not.toBeNull()
      expect(result?.id).toBe('r1')
    })

    it('returns null when recharge request does not exist', async () => {
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce(null)

      const result = await RechargeService.getUserRechargeRequestById('user-1', 'r-nonexistent')
      expect(result).toBeNull()
    })

    it('returns null when recharge request belongs to another user (user isolation)', async () => {
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', userId: 'user-2', amount: 100, status: 'pending',
      })

      const result = await RechargeService.getUserRechargeRequestById('user-1', 'r1')
      expect(result).toBeNull()
    })
  })

  // ============ getRechargeSettings ============
  describe('getRechargeSettings', () => {
    it('returns default settings', async () => {
      const settings = await RechargeService.getRechargeSettings()

      expect(settings.minAmount).toBe(1)
      expect(settings.maxAmount).toBe(50000)
      expect(settings.paymentMethods).toHaveLength(3)
      expect(settings.paymentMethods.map(m => m.value)).toEqual(
        expect.arrayContaining(['alipay', 'wechat', 'bank_card'])
      )
    })

    it('returns payment methods with labels', async () => {
      const settings = await RechargeService.getRechargeSettings()

      const alipay = settings.paymentMethods.find(m => m.value === 'alipay')
      expect(alipay?.label).toBe('支付宝')

      const wechat = settings.paymentMethods.find(m => m.value === 'wechat')
      expect(wechat?.label).toBe('微信')

      const bankCard = settings.paymentMethods.find(m => m.value === 'bank_card')
      expect(bankCard?.label).toBe('银行卡')
    })
  })
})
