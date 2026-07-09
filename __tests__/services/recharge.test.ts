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

  // ============ approveRecharge ============
  describe('approveRecharge', () => {
    it('正常通过：status approved，balance + amount，consumeBalance + amount', async () => {
      // 事务前查 recharge
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', userId: 'u1', amount: 500, status: 'pending', remark: null,
      })
      // updateMany 返回 count=1
      prisma.rechargeRequest.updateMany.mockResolvedValueOnce({ count: 1 })
      // 事务内查用户旧值
      prisma.user.findUnique.mockResolvedValueOnce({
        balance: 1000, frozenBalance: 0, consumeBalance: 200,
        earningsAvailable: 500, earningsPending: 100, earningsVoided: 50, earningsFrozen: 30,
      })
      // user.update 返回更新后的最新值
      prisma.user.update.mockResolvedValueOnce({
        balance: 1500, frozenBalance: 0,
      })
      // balanceRecord.create
      prisma.balanceRecord.create.mockResolvedValueOnce({ id: 'br1' })
      // rechargeAuditLog.create
      prisma.rechargeAuditLog.create.mockResolvedValueOnce({ id: 'al1' })
      // 事务后查 updated
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', userId: 'u1', amount: 500, status: 'approved', reviewedBy: 'admin1',
      })

      const result = await RechargeService.approveRecharge('r1', 'admin1')

      expect(result.status).toBe('approved')

      // 验证 user.update 增加了 balance 和 consumeBalance
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: {
            balance: { increment: 500 },
            consumeBalance: { increment: 500 },
          },
        })
      )
    })

    it('写 BalanceRecord，type=recharge，sourceType=recharge_request', async () => {
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', userId: 'u1', amount: 500, status: 'pending', remark: null,
      })
      prisma.rechargeRequest.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.user.findUnique.mockResolvedValueOnce({
        balance: 1000, frozenBalance: 0, consumeBalance: 200,
        earningsAvailable: 500, earningsPending: 100, earningsVoided: 50, earningsFrozen: 30,
      })
      prisma.user.update.mockResolvedValueOnce({
        balance: 1500, frozenBalance: 0,
      })
      prisma.balanceRecord.create.mockResolvedValueOnce({ id: 'br1' })
      prisma.rechargeAuditLog.create.mockResolvedValueOnce({ id: 'al1' })
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', status: 'approved',
      })

      await RechargeService.approveRecharge('r1', 'admin1')

      expect(prisma.balanceRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'u1',
            type: 'recharge',
            amount: 500,
            sourceType: 'recharge_request',
            sourceId: 'r1',
          }),
        })
      )
    })

    it('使用 updatedUser.balance 写 BalanceRecord.balance', async () => {
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', userId: 'u1', amount: 500, status: 'pending', remark: null,
      })
      prisma.rechargeRequest.updateMany.mockResolvedValueOnce({ count: 1 })
      // 旧余额 1000
      prisma.user.findUnique.mockResolvedValueOnce({
        balance: 1000, frozenBalance: 0, consumeBalance: 200,
        earningsAvailable: 500, earningsPending: 100, earningsVoided: 50, earningsFrozen: 30,
      })
      // user.update 返回新余额 1500（1000+500）
      prisma.user.update.mockResolvedValueOnce({
        balance: 1500, frozenBalance: 0,
      })
      prisma.balanceRecord.create.mockResolvedValueOnce({ id: 'br1' })
      prisma.rechargeAuditLog.create.mockResolvedValueOnce({ id: 'al1' })
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', status: 'approved',
      })

      await RechargeService.approveRecharge('r1', 'admin1')

      // BalanceRecord.balance 应该是 updatedUser.balance = 1500，不是旧 balance + amount
      expect(prisma.balanceRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            balance: 1500,
            frozenBalance: 0,
          }),
        })
      )
    })

    it('不修改 earningsAvailable / earningsFrozen / earningsVoided / earningsPending', async () => {
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', userId: 'u1', amount: 500, status: 'pending', remark: null,
      })
      prisma.rechargeRequest.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.user.findUnique.mockResolvedValueOnce({
        balance: 1000, frozenBalance: 0, consumeBalance: 200,
        earningsAvailable: 500, earningsPending: 100, earningsVoided: 50, earningsFrozen: 30,
      })
      prisma.user.update.mockResolvedValueOnce({
        balance: 1500, frozenBalance: 0,
      })
      prisma.balanceRecord.create.mockResolvedValueOnce({ id: 'br1' })
      prisma.rechargeAuditLog.create.mockResolvedValueOnce({ id: 'al1' })
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', status: 'approved',
      })

      await RechargeService.approveRecharge('r1', 'admin1')

      // user.update 的 data 里只能有 balance 和 consumeBalance，不能有 earnings* 字段
      const updateCall = prisma.user.update.mock.calls[0][0]
      expect(updateCall.data).toHaveProperty('balance')
      expect(updateCall.data).toHaveProperty('consumeBalance')
      expect(updateCall.data).not.toHaveProperty('earningsAvailable')
      expect(updateCall.data).not.toHaveProperty('earningsFrozen')
      expect(updateCall.data).not.toHaveProperty('earningsVoided')
      expect(updateCall.data).not.toHaveProperty('earningsPending')
    })

    it('非 pending 报错"充值申请不存在或已审核"', async () => {
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', userId: 'u1', amount: 500, status: 'approved', remark: null,
      })

      await expect(
        RechargeService.approveRecharge('r1', 'admin1')
      ).rejects.toThrow('充值申请不存在或已审核')
    })

    it('充值申请不存在报错', async () => {
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce(null)

      await expect(
        RechargeService.approveRecharge('r-nonexistent', 'admin1')
      ).rejects.toThrow('充值申请不存在')
    })

    it('updateMany count=0 时报错（并发竞争）', async () => {
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', userId: 'u1', amount: 500, status: 'pending', remark: null,
      })
      // 模拟并发：updateMany 返回 count=0（已被其他事务改掉）
      prisma.rechargeRequest.updateMany.mockResolvedValueOnce({ count: 0 })

      await expect(
        RechargeService.approveRecharge('r1', 'admin1')
      ).rejects.toThrow('充值申请不存在或已审核')

      // 不应该执行后续操作
      expect(prisma.user.update).not.toHaveBeenCalled()
      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
    })

    it('写 RechargeAuditLog action=approve', async () => {
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', userId: 'u1', amount: 500, status: 'pending', remark: null,
      })
      prisma.rechargeRequest.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.user.findUnique.mockResolvedValueOnce({
        balance: 1000, frozenBalance: 0, consumeBalance: 200,
        earningsAvailable: 500, earningsPending: 100, earningsVoided: 50, earningsFrozen: 30,
      })
      prisma.user.update.mockResolvedValueOnce({
        balance: 1500, frozenBalance: 0,
      })
      prisma.balanceRecord.create.mockResolvedValueOnce({ id: 'br1' })
      prisma.rechargeAuditLog.create.mockResolvedValueOnce({ id: 'al1' })
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', status: 'approved',
      })

      await RechargeService.approveRecharge('r1', 'admin1')

      expect(prisma.rechargeAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            requestId: 'r1',
            action: 'approve',
            oldStatus: 'pending',
            newStatus: 'approved',
            operatorId: 'admin1',
          }),
        })
      )
    })

    it('approve 不调用 logOperation（logOperation 在 route 层）', async () => {
      // service 不再 import logOperation，所以不需要额外验证
      // 这里确保 service 只做数据操作
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', userId: 'u1', amount: 500, status: 'pending', remark: null,
      })
      prisma.rechargeRequest.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.user.findUnique.mockResolvedValueOnce({
        balance: 1000, frozenBalance: 0, consumeBalance: 200,
        earningsAvailable: 500, earningsPending: 100, earningsVoided: 50, earningsFrozen: 30,
      })
      prisma.user.update.mockResolvedValueOnce({
        balance: 1500, frozenBalance: 0,
      })
      prisma.balanceRecord.create.mockResolvedValueOnce({ id: 'br1' })
      prisma.rechargeAuditLog.create.mockResolvedValueOnce({ id: 'al1' })
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', status: 'approved',
      })

      await RechargeService.approveRecharge('r1', 'admin1')

      // service 层不应该创建 operationLog
      expect(prisma.operationLog).toBeUndefined()
    })
  })

  // ============ rejectRecharge ============
  describe('rejectRecharge', () => {
    it('正常拒绝：status rejected，写 rejectReason', async () => {
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', userId: 'u1', amount: 500, status: 'pending', remark: null,
      })
      prisma.rechargeRequest.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.rechargeAuditLog.create.mockResolvedValueOnce({ id: 'al1' })
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', status: 'rejected', rejectReason: '凭证不清晰',
      })

      const result = await RechargeService.rejectRecharge(
        'r1', 'admin1', '凭证不清晰'
      )

      expect(result.status).toBe('rejected')
      expect(result.rejectReason).toBe('凭证不清晰')

      // 验证 updateMany 写了 rejectReason
      expect(prisma.rechargeRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'rejected',
            rejectReason: '凭证不清晰',
          }),
        })
      )
    })

    it('不写 BalanceRecord', async () => {
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', userId: 'u1', amount: 500, status: 'pending', remark: null,
      })
      prisma.rechargeRequest.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.rechargeAuditLog.create.mockResolvedValueOnce({ id: 'al1' })
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', status: 'rejected',
      })

      await RechargeService.rejectRecharge('r1', 'admin1', '凭证不清晰')

      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
    })

    it('不调用 user.update / user.updateMany', async () => {
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', userId: 'u1', amount: 500, status: 'pending', remark: null,
      })
      prisma.rechargeRequest.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.rechargeAuditLog.create.mockResolvedValueOnce({ id: 'al1' })
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', status: 'rejected',
      })

      await RechargeService.rejectRecharge('r1', 'admin1', '凭证不清晰')

      expect(prisma.user.update).not.toHaveBeenCalled()
      expect(prisma.user.updateMany).not.toHaveBeenCalled()
    })

    it('空字符串 rejectReason 且无 rejectTemplateId 时报错', async () => {
      await expect(
        RechargeService.rejectRecharge('r1', 'admin1', '')
      ).rejects.toThrow('请填写拒绝原因或选择拒绝模板')
    })

    it('纯空格 rejectReason 且无 rejectTemplateId 时报错', async () => {
      await expect(
        RechargeService.rejectRecharge('r1', 'admin1', '   ')
      ).rejects.toThrow('请填写拒绝原因或选择拒绝模板')
    })

    it('非 pending 报错"充值申请不存在或已审核"', async () => {
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', userId: 'u1', amount: 500, status: 'rejected', remark: null,
      })

      await expect(
        RechargeService.rejectRecharge('r1', 'admin1', '凭证不清晰')
      ).rejects.toThrow('充值申请不存在或已审核')
    })

    it('充值申请不存在报错', async () => {
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce(null)

      await expect(
        RechargeService.rejectRecharge('r-nonexistent', 'admin1', '凭证不清晰')
      ).rejects.toThrow('充值申请不存在')
    })

    it('updateMany count=0 时报错（并发竞争）', async () => {
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', userId: 'u1', amount: 500, status: 'pending', remark: null,
      })
      prisma.rechargeRequest.updateMany.mockResolvedValueOnce({ count: 0 })

      await expect(
        RechargeService.rejectRecharge('r1', 'admin1', '凭证不清晰')
      ).rejects.toThrow('充值申请不存在或已审核')

      expect(prisma.rechargeAuditLog.create).not.toHaveBeenCalled()
    })

    it('写 RechargeAuditLog action=reject', async () => {
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', userId: 'u1', amount: 500, status: 'pending', remark: null,
      })
      prisma.rechargeRequest.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.rechargeAuditLog.create.mockResolvedValueOnce({ id: 'al1' })
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', status: 'rejected',
      })

      await RechargeService.rejectRecharge('r1', 'admin1', '凭证不清晰')

      expect(prisma.rechargeAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            requestId: 'r1',
            action: 'reject',
            oldStatus: 'pending',
            newStatus: 'rejected',
            operatorId: 'admin1',
            reason: '凭证不清晰',
          }),
        })
      )
    })

    it('rejectReason 被 trim 后存储', async () => {
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', userId: 'u1', amount: 500, status: 'pending', remark: null,
      })
      prisma.rechargeRequest.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.rechargeAuditLog.create.mockResolvedValueOnce({ id: 'al1' })
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', status: 'rejected',
      })

      await RechargeService.rejectRecharge('r1', 'admin1', '  凭证不清晰  ')

      // updateMany 存的 rejectReason 是 trim 后的
      expect(prisma.rechargeRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rejectReason: '凭证不清晰',
          }),
        })
      )

      // auditLog 存的 reason 也是 trim 后的
      expect(prisma.rechargeAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reason: '凭证不清晰',
          }),
        })
      )
    })

    it('有 rejectTemplateId 但无 rejectReason 时正常通过', async () => {
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', userId: 'u1', amount: 500, status: 'pending', remark: null,
      })
      prisma.rechargeRequest.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.rechargeAuditLog.create.mockResolvedValueOnce({ id: 'al1' })
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', status: 'rejected',
      })

      const result = await RechargeService.rejectRecharge(
        'r1', 'admin1', '', 'tpl-001'
      )

      expect(result.status).toBe('rejected')

      // rejectTemplateId 被写入
      expect(prisma.rechargeRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rejectTemplateId: 'tpl-001',
            rejectReason: null,
          }),
        })
      )
    })
  })
})
