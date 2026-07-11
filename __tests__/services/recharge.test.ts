import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma before importing service
vi.mock('@/lib/prisma', () => {
  const createMockChain = () => ({
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
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
import { getBusinessConfig } from '@/lib/config/business'
import { RechargeService } from '@/lib/services/recharge.service'
import { RECHARGE_PAYMENT_METHOD } from '@/lib/constants'

// 测试辅助：配置充值开启 + 有效二维码
const setupRechargeOpen = () => {
  vi.mocked(getBusinessConfig).mockImplementation(async (key: string, defaultValue: any) => {
    const values: Record<string, unknown> = {
      'recharge.enabled': true,
      'recharge.qr_code_url': 'https://example.com/recharge-qr.png',
      'recharge.min_amount': 1,
      'recharge.max_amount': 50000,
    }
    return key in values ? values[key] : defaultValue
  })
}

const setupRechargeClosed = () => {
  vi.mocked(getBusinessConfig).mockImplementation(async (key: string, defaultValue: any) => {
    const values: Record<string, unknown> = {
      'recharge.enabled': false,
    }
    return key in values ? values[key] : defaultValue
  })
}

const setupQrMissing = () => {
  vi.mocked(getBusinessConfig).mockImplementation(async (key: string, defaultValue: any) => {
    const values: Record<string, unknown> = {
      'recharge.enabled': true,
      'recharge.qr_code_url': undefined,
    }
    return key in values ? values[key] : defaultValue
  })
}

describe('RechargeService', () => {
  beforeEach(() => {
    // vi.clearAllMocks 不清 mockResolvedValueOnce 队列，会导致前一个 it 的 mock 残留
    // 用 mockReset 精确清掉 chain 上各方法的队列
    vi.clearAllMocks()
    prisma.user.findUnique.mockReset()
    prisma.user.findMany.mockReset()
    prisma.user.update.mockReset()
    prisma.user.updateMany.mockReset()
    prisma.rechargeRequest.findUnique.mockReset()
    prisma.rechargeRequest.findMany.mockReset()
    prisma.rechargeRequest.create.mockReset()
    prisma.rechargeRequest.updateMany.mockReset()
    prisma.rechargeRequest.count.mockReset()
    prisma.balanceRecord.create.mockReset()
    prisma.rechargeAuditLog.create.mockReset()
    prisma.systemConfig.findMany.mockReset()
    prisma.systemConfig.upsert.mockReset()
    // $transaction 实现保留
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma))
  })

  // ============ createRechargeRequest ============
  describe('createRechargeRequest', () => {
    it('新充值申请固定写入 qr_code，不接受用户支付方式', async () => {
      setupRechargeOpen()
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1' })
      prisma.rechargeRequest.create.mockResolvedValueOnce({
        id: 'r1', userId: 'u1', amount: 500, status: 'pending',
        paymentMethod: 'qr_code', paymentProofUrl: 'https://example.com/proof.png',
      })
      prisma.rechargeAuditLog.create.mockResolvedValueOnce({ id: 'a1' })

      const result = await RechargeService.createRechargeRequest('u1', {
        amount: 500,
        paymentProofUrl: 'https://example.com/proof.png',
      })

      expect(result).toBeDefined()
      expect(result.status).toBe('pending')
      expect(result.amount).toBe(500)

      // 验证 create 写入的 paymentMethod 必须是 'qr_code'
      expect(prisma.rechargeRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'u1',
            amount: 500,
            paymentMethod: 'qr_code',
            paymentProofUrl: 'https://example.com/proof.png',
            status: 'pending',
          }),
        })
      )
    })

    it('CreateRechargeParams 类型不包含 paymentMethod（运行时：传 paymentMethod 被忽略）', async () => {
      // 修复五清理：只保留一种验证方式
      // 运行时"恶意传 paymentMethod"测试：用 as unknown as CreateRechargeParams 绕过编译期检查
      setupRechargeOpen()
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1' })
      prisma.rechargeRequest.create.mockResolvedValueOnce({ id: 'r1', status: 'pending' })
      prisma.rechargeAuditLog.create.mockResolvedValueOnce({ id: 'a1' })

      await RechargeService.createRechargeRequest('u1', {
        amount: 500,
        paymentProofUrl: 'https://example.com/proof.png',
        paymentMethod: 'alipay',  // 即使传 alipay 也应被忽略
      } as unknown as Parameters<typeof RechargeService.createRechargeRequest>[1])

      // 验证最终写入的还是 qr_code（不是 alipay）
      const createCall = prisma.rechargeRequest.create.mock.calls[0][0] as any
      expect(createCall.data.paymentMethod).toBe('qr_code')
    })

    it('充值关闭时拒绝创建新申请', async () => {
      setupRechargeClosed()

      await expect(
        RechargeService.createRechargeRequest('u1', {
          amount: 500,
          paymentProofUrl: 'https://example.com/proof.png',
        })
      ).rejects.toThrow('充值服务暂时关闭，请联系客服')
    })

    it('二维码未配置时拒绝创建新申请', async () => {
      setupQrMissing()

      await expect(
        RechargeService.createRechargeRequest('u1', {
          amount: 500,
          paymentProofUrl: 'https://example.com/proof.png',
        })
      ).rejects.toThrow('充值二维码尚未配置')
    })

    it('充值开启且二维码有效时正常创建申请', async () => {
      setupRechargeOpen()
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1' })
      prisma.rechargeRequest.create.mockResolvedValueOnce({ id: 'r1', status: 'pending' })
      prisma.rechargeAuditLog.create.mockResolvedValueOnce({ id: 'a1' })

      await RechargeService.createRechargeRequest('u1', {
        amount: 500,
        paymentProofUrl: 'https://example.com/proof.png',
      })

      expect(prisma.rechargeRequest.create).toHaveBeenCalledTimes(1)
    })

    it('throws "充值金额必须为有效数字且大于0" when amount <= 0', async () => {
      await expect(
        RechargeService.createRechargeRequest('u1', {
          amount: 0,
          paymentProofUrl: 'https://example.com/proof.png',
        })
      ).rejects.toThrow('充值金额必须为有效数字且大于0')

      await expect(
        RechargeService.createRechargeRequest('u1', {
          amount: -100,
          paymentProofUrl: 'https://example.com/proof.png',
        })
      ).rejects.toThrow('充值金额必须为有效数字且大于0')
    })

    it('throws "充值金额必须为有效数字且大于0" when amount is a string', async () => {
      await expect(
        // @ts-expect-error 测试目的
        RechargeService.createRechargeRequest('u1', {
          amount: '100',
          paymentProofUrl: 'https://example.com/proof.png',
        })
      ).rejects.toThrow('充值金额必须为有效数字且大于0')
    })

    it('throws "充值金额必须为有效数字且大于0" when amount is NaN', async () => {
      await expect(
        RechargeService.createRechargeRequest('u1', {
          amount: NaN,
          paymentProofUrl: 'https://example.com/proof.png',
        })
      ).rejects.toThrow('充值金额必须为有效数字且大于0')
    })

    it('throws "充值金额必须为有效数字且大于0" when amount is Infinity', async () => {
      await expect(
        RechargeService.createRechargeRequest('u1', {
          amount: Infinity,
          paymentProofUrl: 'https://example.com/proof.png',
        })
      ).rejects.toThrow('充值金额必须为有效数字且大于0')
    })

    it('throws "请上传付款凭证" when paymentProofUrl missing', async () => {
      setupRechargeOpen()
      await expect(
        RechargeService.createRechargeRequest('u1', {
          amount: 100,
          paymentProofUrl: '',
        })
      ).rejects.toThrow('请上传付款凭证')
    })

    it('throws "请上传付款凭证" when paymentProofUrl is whitespace', async () => {
      setupRechargeOpen()
      await expect(
        RechargeService.createRechargeRequest('u1', {
          amount: 100,
          paymentProofUrl: '   ',
        })
      ).rejects.toThrow('请上传付款凭证')
    })

    it('throws "付款凭证链接必须为 https:// 开头" when paymentProofUrl is not https', async () => {
      setupRechargeOpen()
      await expect(
        RechargeService.createRechargeRequest('u1', {
          amount: 100,
          paymentProofUrl: 'http://example.com/proof.png',
        })
      ).rejects.toThrow('付款凭证链接必须为 https:// 开头')
    })

    it('throws "用户不存在" when user not found', async () => {
      setupRechargeOpen()
      prisma.user.findUnique.mockResolvedValueOnce(null)

      await expect(
        RechargeService.createRechargeRequest('u-nonexistent', {
          amount: 100,
          paymentProofUrl: 'https://example.com/proof.png',
        })
      ).rejects.toThrow('用户不存在')
    })

    it('throws "最低充值金额" when amount < minAmount', async () => {
      setupRechargeOpen()
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1' })

      await expect(
        RechargeService.createRechargeRequest('u1', {
          amount: 0.5,
          paymentProofUrl: 'https://example.com/proof.png',
        })
      ).rejects.toThrow('最低充值金额')
    })

    it('throws "单笔最高充值金额" when amount > maxAmount', async () => {
      setupRechargeOpen()
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1' })

      await expect(
        RechargeService.createRechargeRequest('u1', {
          amount: 60000,
          paymentProofUrl: 'https://example.com/proof.png',
        })
      ).rejects.toThrow('单笔最高充值金额')
    })

    it('提交申请不修改 balance / consumeBalance / earningsAvailable / earningsFrozen', async () => {
      setupRechargeOpen()
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1' })
      prisma.rechargeRequest.create.mockResolvedValueOnce({ id: 'r1', status: 'pending' })
      prisma.rechargeAuditLog.create.mockResolvedValueOnce({ id: 'a1' })

      await RechargeService.createRechargeRequest('u1', {
        amount: 500,
        paymentProofUrl: 'https://example.com/proof.png',
      })

      // 验证没有调用 user.updateMany
      expect(prisma.user.updateMany).not.toHaveBeenCalled()
    })

    it('提交申请不写 BalanceRecord', async () => {
      setupRechargeOpen()
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1' })
      prisma.rechargeRequest.create.mockResolvedValueOnce({ id: 'r1', status: 'pending' })
      prisma.rechargeAuditLog.create.mockResolvedValueOnce({ id: 'a1' })

      await RechargeService.createRechargeRequest('u1', {
        amount: 500,
        paymentProofUrl: 'https://example.com/proof.png',
      })

      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
    })

    it('trims paymentProofUrl whitespace', async () => {
      setupRechargeOpen()
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1' })
      prisma.rechargeRequest.create.mockResolvedValueOnce({ id: 'r1', status: 'pending' })
      prisma.rechargeAuditLog.create.mockResolvedValueOnce({ id: 'a1' })

      await RechargeService.createRechargeRequest('u1', {
        amount: 100,
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

    it('RECHARGE_PAYMENT_METHOD.QR_CODE 常量值为 qr_code', () => {
      expect(RECHARGE_PAYMENT_METHOD.QR_CODE).toBe('qr_code')
    })

    it('RECHARGE_PAYMENT_METHOD 保留三个历史值（不删除）', () => {
      expect(RECHARGE_PAYMENT_METHOD.ALIPAY).toBe('alipay')
      expect(RECHARGE_PAYMENT_METHOD.WECHAT).toBe('wechat')
      expect(RECHARGE_PAYMENT_METHOD.BANK_CARD).toBe('bank_card')
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

  // ============ getRechargeSettings (委托 RechargeSettingsService) ============
  describe('getRechargeSettings', () => {
    it('委托 RechargeSettingsService.getSettings() 返回新单二维码结构（无 paymentMethods / 旧字段）', async () => {
      // getBusinessConfig 是 mock 的，默认走 defaultValue
      // 真实 RechargeSettingsService.getSettings 内部 9 次 getBusinessConfig，
      // 返回默认结构（enabled=false, qrCodeUrl=undefined, minAmount=1, maxAmount=50000, instruction=默认文案）
      const settings = await RechargeService.getRechargeSettings()

      // 验证新结构字段
      expect(settings).toHaveProperty('enabled')
      expect(settings).toHaveProperty('minAmount')
      expect(settings).toHaveProperty('maxAmount')
      expect(settings).toHaveProperty('instruction')
      expect(settings).toHaveProperty('qrCodeUrl')
      expect(settings).toHaveProperty('qrCodeLabel')
      expect(settings).toHaveProperty('payeeName')
      expect(settings).toHaveProperty('contactPhone')
      expect(settings).toHaveProperty('serviceTime')

      // 验证旧字段已移除
      expect((settings as any).paymentMethods).toBeUndefined()
      expect((settings as any).alipayAccount).toBeUndefined()
      expect((settings as any).wechatAccount).toBeUndefined()
      expect((settings as any).bankCardAccount).toBeUndefined()
      expect((settings as any).bankCardName).toBeUndefined()
      expect((settings as any).bankName).toBeUndefined()
    })
  })

  // ============ approveRecharge (关键业务红线：不影响历史审核) ============
  describe('approveRecharge', () => {
    it('正常通过：status approved，balance + amount，consumeBalance + amount', async () => {
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
        id: 'r1', userId: 'u1', amount: 500, status: 'approved', reviewedBy: 'admin1',
      })

      const result = await RechargeService.approveRecharge('r1', 'admin1')

      expect(result.status).toBe('approved')

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
      prisma.user.update.mockResolvedValueOnce({ balance: 1500, frozenBalance: 0 })
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
      prisma.user.findUnique.mockResolvedValueOnce({
        balance: 1000, frozenBalance: 0, consumeBalance: 200,
        earningsAvailable: 500, earningsPending: 100, earningsVoided: 50, earningsFrozen: 30,
      })
      prisma.user.update.mockResolvedValueOnce({ balance: 1500, frozenBalance: 0 })
      prisma.balanceRecord.create.mockResolvedValueOnce({ id: 'br1' })
      prisma.rechargeAuditLog.create.mockResolvedValueOnce({ id: 'al1' })
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({ id: 'r1', status: 'approved' })

      await RechargeService.approveRecharge('r1', 'admin1')

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
      prisma.user.update.mockResolvedValueOnce({ balance: 1500, frozenBalance: 0 })
      prisma.balanceRecord.create.mockResolvedValueOnce({ id: 'br1' })
      prisma.rechargeAuditLog.create.mockResolvedValueOnce({ id: 'al1' })
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({ id: 'r1', status: 'approved' })

      await RechargeService.approveRecharge('r1', 'admin1')

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
      prisma.rechargeRequest.updateMany.mockResolvedValueOnce({ count: 0 })

      await expect(
        RechargeService.approveRecharge('r1', 'admin1')
      ).rejects.toThrow('充值申请不存在或已审核')

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
      prisma.user.update.mockResolvedValueOnce({ balance: 1500, frozenBalance: 0 })
      prisma.balanceRecord.create.mockResolvedValueOnce({ id: 'br1' })
      prisma.rechargeAuditLog.create.mockResolvedValueOnce({ id: 'al1' })
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({ id: 'r1', status: 'approved' })

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

    // 关键业务红线：关闭充值不影响 approveRecharge
    it('关闭充值不影响 approveRecharge（历史待审核申请仍可通过）', async () => {
      setupRechargeClosed()  // 充值关闭
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', userId: 'u1', amount: 500, status: 'pending', remark: null,
      })
      prisma.rechargeRequest.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.user.findUnique.mockResolvedValueOnce({
        balance: 1000, frozenBalance: 0, consumeBalance: 200,
        earningsAvailable: 500, earningsPending: 100, earningsVoided: 50, earningsFrozen: 30,
      })
      prisma.user.update.mockResolvedValueOnce({ balance: 1500, frozenBalance: 0 })
      prisma.balanceRecord.create.mockResolvedValueOnce({ id: 'br1' })
      prisma.rechargeAuditLog.create.mockResolvedValueOnce({ id: 'al1' })
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({ id: 'r1', status: 'approved' })

      const result = await RechargeService.approveRecharge('r1', 'admin1')
      expect(result.status).toBe('approved')
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

      const result = await RechargeService.rejectRecharge('r1', 'admin1', '凭证不清晰')

      expect(result.status).toBe('rejected')
      expect(result.rejectReason).toBe('凭证不清晰')

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
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({ id: 'r1', status: 'rejected' })

      await RechargeService.rejectRecharge('r1', 'admin1', '凭证不清晰')

      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
    })

    it('不调用 user.update / user.updateMany', async () => {
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', userId: 'u1', amount: 500, status: 'pending', remark: null,
      })
      prisma.rechargeRequest.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.rechargeAuditLog.create.mockResolvedValueOnce({ id: 'al1' })
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({ id: 'r1', status: 'rejected' })

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
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({ id: 'r1', status: 'rejected' })

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
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({ id: 'r1', status: 'rejected' })

      await RechargeService.rejectRecharge('r1', 'admin1', '  凭证不清晰  ')

      expect(prisma.rechargeRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rejectReason: '凭证不清晰',
          }),
        })
      )

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
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({ id: 'r1', status: 'rejected' })

      const result = await RechargeService.rejectRecharge('r1', 'admin1', '', 'tpl-001')

      expect(result.status).toBe('rejected')

      expect(prisma.rechargeRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rejectTemplateId: 'tpl-001',
            rejectReason: null,
          }),
        })
      )
    })

    // 关键业务红线：关闭充值不影响 rejectRecharge
    it('关闭充值不影响 rejectRecharge（历史待审核申请仍可拒绝）', async () => {
      setupRechargeClosed()  // 充值关闭
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', userId: 'u1', amount: 500, status: 'pending', remark: null,
      })
      prisma.rechargeRequest.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.rechargeAuditLog.create.mockResolvedValueOnce({ id: 'al1' })
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({ id: 'r1', status: 'rejected' })

      const result = await RechargeService.rejectRecharge('r1', 'admin1', '凭证不清晰')
      expect(result.status).toBe('rejected')
    })
  })

  // ============ listAdminRechargeRequests ============
  describe('listAdminRechargeRequests', () => {
    it('默认分页：page=1, pageSize=20', async () => {
      prisma.rechargeRequest.findMany.mockResolvedValueOnce([
        { id: 'r1', userId: 'u1', amount: 100, status: 'pending', reviewedBy: null },
      ] as any)
      prisma.rechargeRequest.count.mockResolvedValueOnce(1)

      const result = await RechargeService.listAdminRechargeRequests({})

      expect(result.data).toHaveLength(1)
      expect(result.pagination.page).toBe(1)
      expect(result.pagination.pageSize).toBe(20)
      expect(result.pagination.total).toBe(1)
      expect(result.pagination.totalPages).toBe(1)

      expect(prisma.rechargeRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
          orderBy: { createdAt: 'desc' },
        })
      )
    })

    it('按 status 筛选', async () => {
      prisma.rechargeRequest.findMany.mockResolvedValueOnce([] as any)
      prisma.rechargeRequest.count.mockResolvedValueOnce(0)

      await RechargeService.listAdminRechargeRequests({ status: 'pending' })

      expect(prisma.rechargeRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'pending' }),
        })
      )
    })

    it('按 paymentMethod 筛选', async () => {
      prisma.rechargeRequest.findMany.mockResolvedValueOnce([] as any)
      prisma.rechargeRequest.count.mockResolvedValueOnce(0)

      await RechargeService.listAdminRechargeRequests({ paymentMethod: 'alipay' })

      expect(prisma.rechargeRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ paymentMethod: 'alipay' }),
        })
      )
    })

    it('按 search 搜索 user.phone / nickname', async () => {
      prisma.rechargeRequest.findMany.mockResolvedValueOnce([] as any)
      prisma.rechargeRequest.count.mockResolvedValueOnce(0)

      await RechargeService.listAdminRechargeRequests({ search: '13800' })

      expect(prisma.rechargeRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user: {
              OR: [
                { phone: { contains: '13800' } },
                { nickname: { contains: '13800' } },
              ],
            },
          }),
        })
      )
    })

    it('补充审核人信息（reviewer）', async () => {
      prisma.rechargeRequest.findMany.mockResolvedValueOnce([
        { id: 'r1', userId: 'u1', amount: 100, status: 'approved', reviewedBy: 'admin1' },
      ] as any)
      prisma.rechargeRequest.count.mockResolvedValueOnce(1)
      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'admin1', phone: '13900000000', nickname: '管理员' },
      ])

      const result = await RechargeService.listAdminRechargeRequests({})

      expect(result.data[0].reviewer).toEqual({
        id: 'admin1', phone: '13900000000', nickname: '管理员',
      })
    })

    it('reviewedBy 为 null 时 reviewer 也为 null', async () => {
      prisma.rechargeRequest.findMany.mockResolvedValueOnce([
        { id: 'r1', userId: 'u1', amount: 100, status: 'pending', reviewedBy: null },
      ] as any)
      prisma.rechargeRequest.count.mockResolvedValueOnce(1)

      const result = await RechargeService.listAdminRechargeRequests({})

      expect(result.data[0].reviewer).toBeNull()
    })

    it('pageSize 最大 100', async () => {
      prisma.rechargeRequest.findMany.mockResolvedValueOnce([] as any)
      prisma.rechargeRequest.count.mockResolvedValueOnce(0)

      await RechargeService.listAdminRechargeRequests({ pageSize: 200 })

      expect(prisma.rechargeRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 })
      )
    })

    it('page=2 时 skip 正确计算', async () => {
      prisma.rechargeRequest.findMany.mockResolvedValueOnce([] as any)
      prisma.rechargeRequest.count.mockResolvedValueOnce(0)

      await RechargeService.listAdminRechargeRequests({ page: 2, pageSize: 10 })

      expect(prisma.rechargeRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 })
      )
    })
  })

  // ============ getAdminRechargeRequestById ============
  describe('getAdminRechargeRequestById', () => {
    it('找到记录时返回详情 + 用户信息', async () => {
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', userId: 'u1', amount: 500, status: 'pending',
        paymentMethod: 'alipay', paymentProofUrl: 'https://example.com/proof.png',
        rejectReason: null, rejectTemplateId: null, reviewedBy: null,
        reviewedAt: null, approvedAt: null, remark: null,
        createdAt: new Date(), updatedAt: new Date(),
        user: { id: 'u1', phone: '13800000000', nickname: '张三', level: 1 },
      } as any)

      const result = await RechargeService.getAdminRechargeRequestById('r1')

      expect(result).not.toBeNull()
      expect(result?.id).toBe('r1')
      expect(result?.user).toEqual({ id: 'u1', phone: '13800000000', nickname: '张三', level: 1 })
      expect(result?.reviewer).toBeNull()
    })

    it('找不到返回 null', async () => {
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce(null)

      const result = await RechargeService.getAdminRechargeRequestById('r-nonexistent')
      expect(result).toBeNull()
    })

    it('有 reviewedBy 时补充审核人信息', async () => {
      prisma.rechargeRequest.findUnique.mockResolvedValueOnce({
        id: 'r1', userId: 'u1', amount: 500, status: 'approved',
        paymentMethod: 'alipay', paymentProofUrl: 'https://example.com/proof.png',
        rejectReason: null, rejectTemplateId: null, reviewedBy: 'admin1',
        reviewedAt: new Date(), approvedAt: new Date(), remark: null,
        createdAt: new Date(), updatedAt: new Date(),
        user: { id: 'u1', phone: '13800000000', nickname: '张三', level: 1 },
      } as any)
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'admin1', phone: '13900000000', nickname: '管理员',
      })

      const result = await RechargeService.getAdminRechargeRequestById('r1')

      expect(result).not.toBeNull()
      expect(result?.reviewer).toEqual({
        id: 'admin1', phone: '13900000000', nickname: '管理员',
      })
    })
  })
})
