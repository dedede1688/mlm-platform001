import { describe, it, expect, vi, beforeEach } from 'vitest'

// v60.3 batch 2: order-lifecycle.service.ts 补全 (9% → 70%+)

// ====== Mock 所有依赖 ======

// 1. prisma - 完整的 order/user/product/balanceRecord/pointsRecord/notification 操作
const mocks = vi.hoisted(() => ({
  order: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  product: {
    update: vi.fn(),
  },
  balanceRecord: {
    create: vi.fn(),
  },
  pointsRecord: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: mocks.order,
    user: mocks.user,
    product: mocks.product,
    balanceRecord: mocks.balanceRecord,
    pointsRecord: mocks.pointsRecord,
    $transaction: mocks.$transaction,
  },
}))

// 2. RewardService - 静态方法
vi.mock('@/lib/services/reward.service', () => ({
  RewardService: {
    processOrderRewards: vi.fn(),
    processRefund: vi.fn(),
  },
}))

// 3. OrderNotificationService - 4 个通知方法
vi.mock('@/lib/services/order-notification.service', () => ({
  OrderNotificationService: {
    notifyOrderPaid: vi.fn(),
    notifyOrderShipped: vi.fn(),
    notifyOrderCompleted: vi.fn(),
    notifyOrderCancelled: vi.fn(),
  },
}))

// 4. 支付密码校验
vi.mock('@/lib/auth/payment-password', () => ({
  verifyPaymentPassword: vi.fn(),
}))

// 5. 系统参数
vi.mock('@/lib/config/system-parameters', () => ({
  getSystemParameter: vi.fn(),
}))

// 6. 通知发送 - 默认返回 resolved Promise(代码会 .catch())
vi.mock('@/lib/notification/sendEmail', () => ({
  sendEmail: vi.fn(() => Promise.resolve()),
}))
vi.mock('@/lib/notification/sendSms', () => ({
  sendSms: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

// 现在可以导入被测代码
import { OrderLifecycleService } from '@/lib/services/order-lifecycle.service'
import { RewardService } from '@/lib/services/reward.service'
import { OrderNotificationService } from '@/lib/services/order-notification.service'
import { verifyPaymentPassword } from '@/lib/auth/payment-password'
import { getSystemParameter } from '@/lib/config/system-parameters'
import { sendEmail } from '@/lib/notification/sendEmail'
import { sendSms } from '@/lib/notification/sendSms'
import { logger } from '@/lib/logger'

describe('OrderLifecycleService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 默认 $transaction 直接调用 callback,传入 tx
    mocks.$transaction.mockImplementation(async (cb: any) => {
      return cb({
        order: mocks.order,
        user: mocks.user,
        product: mocks.product,
        balanceRecord: mocks.balanceRecord,
        pointsRecord: mocks.pointsRecord,
      })
    })
  })

  // ============ verifyPayment ============
  describe('verifyPayment', () => {
    it('throws when order not found', async () => {
      mocks.order.findUnique.mockResolvedValueOnce(null)
      await expect(OrderLifecycleService.verifyPayment('order-1', '123456'))
        .rejects.toThrow('订单不存在')
    })

    it('throws when order status is not pending', async () => {
      mocks.order.findUnique.mockResolvedValueOnce({ id: 'order-1', status: 'paid', userId: 'user-1' } as any)
      await expect(OrderLifecycleService.verifyPayment('order-1', '123456'))
        .rejects.toThrow('订单不存在或状态已变更')
    })

    it('throws when payment password not set', async () => {
      mocks.order.findUnique.mockResolvedValueOnce({ id: 'order-1', status: 'pending', userId: 'user-1' } as any)
      mocks.user.findUnique.mockResolvedValueOnce({ paymentPasswordHash: null } as any)
      await expect(OrderLifecycleService.verifyPayment('order-1', '123456'))
        .rejects.toThrow('尚未设置支付密码')
    })

    it('throws when payment password wrong', async () => {
      mocks.order.findUnique.mockResolvedValueOnce({ id: 'order-1', status: 'pending', userId: 'user-1' } as any)
      mocks.user.findUnique.mockResolvedValueOnce({ paymentPasswordHash: 'hashed' } as any)
      vi.mocked(verifyPaymentPassword).mockResolvedValueOnce(false)
      await expect(OrderLifecycleService.verifyPayment('order-1', 'wrong'))
        .rejects.toThrow('支付密码错误')
    })

    it('happy path: payAmount=0 (no balance deduction)', async () => {
      mocks.order.findUnique
        .mockResolvedValueOnce({ id: 'order-1', status: 'pending', userId: 'user-1', payAmount: 0, orderNo: 'ORD001' } as any)
      mocks.user.findUnique.mockResolvedValueOnce({ paymentPasswordHash: 'hashed' } as any)
      vi.mocked(verifyPaymentPassword).mockResolvedValueOnce(true)
      mocks.order.updateMany.mockResolvedValueOnce({ count: 1 } as any)
      mocks.order.findUnique.mockResolvedValueOnce({ id: 'order-1', status: 'paid' } as any)
      vi.mocked(RewardService.processOrderRewards).mockResolvedValueOnce({} as any)
      vi.mocked(OrderNotificationService.notifyOrderPaid).mockResolvedValueOnce({} as any)

      const result = await OrderLifecycleService.verifyPayment('order-1', '123456')
      expect(result).toBeDefined()
      // payAmount=0 → 不查 freshUser,不写 balanceRecord
      expect(mocks.user.findUnique).toHaveBeenCalledTimes(1) // 仅查 password hash
    })

    it('happy path: payAmount>0 with sufficient balance', async () => {
      mocks.order.findUnique
        .mockResolvedValueOnce({ id: 'order-1', status: 'pending', userId: 'user-1', payAmount: 500, orderNo: 'ORD001' } as any)
      mocks.user.findUnique
        .mockResolvedValueOnce({ paymentPasswordHash: 'hashed' } as any) // 查 password
        .mockResolvedValueOnce({ balance: 1000, consumeBalance: 0, earningsAvailable: 0, earningsPending: 0, earningsVoided: 0, frozenBalance: 0 } as any) // 查 fresh user
      vi.mocked(verifyPaymentPassword).mockResolvedValueOnce(true)
      mocks.order.updateMany.mockResolvedValueOnce({ count: 1 } as any)
      mocks.user.updateMany.mockResolvedValueOnce({ count: 1 } as any)
      mocks.balanceRecord.create.mockResolvedValueOnce({} as any)
      mocks.order.findUnique.mockResolvedValueOnce({ id: 'order-1', status: 'paid' } as any)
      vi.mocked(RewardService.processOrderRewards).mockResolvedValueOnce({} as any)
      vi.mocked(OrderNotificationService.notifyOrderPaid).mockResolvedValueOnce({} as any)

      const result = await OrderLifecycleService.verifyPayment('order-1', '123456')
      expect(result).toBeDefined()
      expect(mocks.balanceRecord.create).toHaveBeenCalled()
    })

    it('throws when balance insufficient', async () => {
      mocks.order.findUnique
        .mockResolvedValueOnce({ id: 'order-1', status: 'pending', userId: 'user-1', payAmount: 500, orderNo: 'ORD001' } as any)
      mocks.user.findUnique
        .mockResolvedValueOnce({ paymentPasswordHash: 'hashed' } as any)
        .mockResolvedValueOnce({ balance: 1000, consumeBalance: 0, earningsAvailable: 0, earningsPending: 0, earningsVoided: 0, frozenBalance: 0 } as any)
      vi.mocked(verifyPaymentPassword).mockResolvedValueOnce(true)
      mocks.order.updateMany.mockResolvedValueOnce({ count: 1 } as any)
      mocks.user.updateMany.mockResolvedValueOnce({ count: 0 } as any) // 余额不足

      await expect(OrderLifecycleService.verifyPayment('order-1', '123456'))
        .rejects.toThrow('可用余额不足')
    })

    it('throws when concurrent status change (updateMany count=0)', async () => {
      mocks.order.findUnique
        .mockResolvedValueOnce({ id: 'order-1', status: 'pending', userId: 'user-1', payAmount: 0, orderNo: 'ORD001' } as any)
      mocks.user.findUnique.mockResolvedValueOnce({ paymentPasswordHash: 'hashed' } as any)
      vi.mocked(verifyPaymentPassword).mockResolvedValueOnce(true)
      mocks.order.updateMany.mockResolvedValueOnce({ count: 0 } as any) // 并发

      await expect(OrderLifecycleService.verifyPayment('order-1', '123456'))
        .rejects.toThrow('订单不存在或状态已变更')
    })
  })

  // ============ shipOrder ============
  describe('shipOrder', () => {
    it('throws when order status not paid', async () => {
      mocks.order.updateMany.mockResolvedValueOnce({ count: 0 } as any)
      await expect(OrderLifecycleService.shipOrder('order-1'))
        .rejects.toThrow('订单不存在或状态已变更')
    })

    it('throws when order not found after update', async () => {
      mocks.order.updateMany.mockResolvedValueOnce({ count: 1 } as any)
      mocks.order.findUnique.mockResolvedValueOnce(null)
      await expect(OrderLifecycleService.shipOrder('order-1'))
        .rejects.toThrow('订单不存在')
    })

    it('sends email and sms when both email and phone present', async () => {
      mocks.order.updateMany.mockResolvedValueOnce({ count: 1 } as any)
      mocks.order.findUnique.mockResolvedValueOnce({
        id: 'order-1',
        orderNo: 'ORD001',
        trackingNumber: 'SF123',
        user: { email: 'user@test.com', phone: '13800138000', nickname: '张三' },
      } as any)
      vi.mocked(OrderNotificationService.notifyOrderShipped).mockResolvedValueOnce({} as any)

      await OrderLifecycleService.shipOrder('order-1', 'SF123')
      expect(sendEmail).toHaveBeenCalled()
      expect(sendSms).toHaveBeenCalled()
      expect(OrderNotificationService.notifyOrderShipped).toHaveBeenCalledWith('order-1')
    })

    it('only sends email when phone missing', async () => {
      mocks.order.updateMany.mockResolvedValueOnce({ count: 1 } as any)
      mocks.order.findUnique.mockResolvedValueOnce({
        id: 'order-1',
        orderNo: 'ORD001',
        trackingNumber: null,
        user: { email: 'user@test.com', phone: null, nickname: '张三' },
      } as any)
      vi.mocked(OrderNotificationService.notifyOrderShipped).mockResolvedValueOnce({} as any)

      await OrderLifecycleService.shipOrder('order-1')
      expect(sendEmail).toHaveBeenCalled()
      expect(sendSms).not.toHaveBeenCalled()
    })

    it('only sends sms when email missing', async () => {
      mocks.order.updateMany.mockResolvedValueOnce({ count: 1 } as any)
      mocks.order.findUnique.mockResolvedValueOnce({
        id: 'order-1',
        orderNo: 'ORD001',
        trackingNumber: 'SF123',
        user: { email: null, phone: '13800138000', nickname: null },
      } as any)
      vi.mocked(OrderNotificationService.notifyOrderShipped).mockResolvedValueOnce({} as any)

      await OrderLifecycleService.shipOrder('order-1')
      expect(sendEmail).not.toHaveBeenCalled()
      expect(sendSms).toHaveBeenCalled()
    })

    it('uses phone as userName when nickname missing', async () => {
      mocks.order.updateMany.mockResolvedValueOnce({ count: 1 } as any)
      mocks.order.findUnique.mockResolvedValueOnce({
        id: 'order-1',
        orderNo: 'ORD001',
        trackingNumber: null,
        user: { email: null, phone: '13800138000', nickname: null },
      } as any)
      vi.mocked(OrderNotificationService.notifyOrderShipped).mockResolvedValueOnce({} as any)

      await OrderLifecycleService.shipOrder('order-1')
      // variables.userName 应该是 phone
      expect(sendSms).toHaveBeenCalledWith(expect.objectContaining({
        variables: expect.objectContaining({ userName: '13800138000' }),
      }))
    })

    // v60.3 batch 7: 补 line 141 - sendEmail 失败 → logger.error
    it('logs error when sendEmail fails (line 141)', async () => {
      mocks.order.updateMany.mockResolvedValueOnce({ count: 1 } as any)
      mocks.order.findUnique.mockResolvedValueOnce({
        id: 'order-1', orderNo: 'ORD001',
        user: { email: 'user@test.com', phone: null, nickname: 'X' },
      } as any)
      vi.mocked(sendEmail).mockRejectedValueOnce(new Error('SMTP 故障'))
      vi.mocked(OrderNotificationService.notifyOrderShipped).mockResolvedValueOnce({} as any)

      await OrderLifecycleService.shipOrder('order-1')

      expect(logger.error).toHaveBeenCalledWith(
        '发送订单发货邮件失败',
        expect.objectContaining({ error: expect.stringContaining('SMTP 故障') })
      )
    })

    // v60.3 batch 7: 补 line 146 - sendSms 失败 → logger.error (String(err) 分支)
    it('logs error when sendSms fails with non-Error object (line 146)', async () => {
      mocks.order.updateMany.mockResolvedValueOnce({ count: 1 } as any)
      mocks.order.findUnique.mockResolvedValueOnce({
        id: 'order-1', orderNo: 'ORD001',
        user: { email: null, phone: '13800138000', nickname: 'X' },
      } as any)
      // 抛非 Error 对象 → 走 String(err) 分支
      vi.mocked(sendSms).mockRejectedValueOnce('字符串错误')
      vi.mocked(OrderNotificationService.notifyOrderShipped).mockResolvedValueOnce({} as any)

      await OrderLifecycleService.shipOrder('order-1')

      expect(logger.error).toHaveBeenCalledWith(
        '发送订单发货短信失败',
        expect.objectContaining({ error: '字符串错误' })
      )
    })
  })

  // ============ completeOrder ============
  describe('completeOrder', () => {
    it('throws when status not shipped', async () => {
      mocks.order.updateMany.mockResolvedValueOnce({ count: 0 } as any)
      await expect(OrderLifecycleService.completeOrder('order-1'))
        .rejects.toThrow('订单不存在或状态已变更')
    })

    it('throws when order not found after update', async () => {
      mocks.order.updateMany.mockResolvedValueOnce({ count: 1 } as any)
      mocks.order.findUnique.mockResolvedValueOnce(null)
      await expect(OrderLifecycleService.completeOrder('order-1'))
        .rejects.toThrow('订单不存在')
    })

    it('happy path', async () => {
      mocks.order.updateMany.mockResolvedValueOnce({ count: 1 } as any)
      mocks.order.findUnique.mockResolvedValueOnce({ id: 'order-1', status: 'completed' } as any)
      vi.mocked(OrderNotificationService.notifyOrderCompleted).mockResolvedValueOnce({} as any)

      const result = await OrderLifecycleService.completeOrder('order-1')
      expect(result).toBeDefined()
      expect(OrderNotificationService.notifyOrderCompleted).toHaveBeenCalledWith('order-1')
    })
  })

  // ============ autoCompleteOrders ============
  describe('autoCompleteOrders', () => {
    it('returns 0 when no orders to complete', async () => {
      vi.mocked(getSystemParameter).mockResolvedValueOnce(7)
      mocks.order.findMany.mockResolvedValueOnce([])
      const count = await OrderLifecycleService.autoCompleteOrders()
      expect(count).toBe(0)
      expect(getSystemParameter).toHaveBeenCalledWith('auto_confirm_days')
    })

    it('completes all overdue orders', async () => {
      vi.mocked(getSystemParameter).mockResolvedValueOnce(7)
      mocks.order.findMany.mockResolvedValueOnce([
        { id: 'order-1' },
        { id: 'order-2' },
        { id: 'order-3' },
      ] as any)
      // mock completeOrder 内部:每个 order 都 updateMany 成功 + findUnique 成功
      mocks.order.updateMany.mockResolvedValue({ count: 1 } as any)
      mocks.order.findUnique.mockResolvedValue({ id: 'order-1', status: 'completed' } as any)
      vi.mocked(OrderNotificationService.notifyOrderCompleted).mockResolvedValue({} as any)

      const count = await OrderLifecycleService.autoCompleteOrders()
      expect(count).toBe(3)
    })
  })

  // ============ requestRefund ============
  describe('requestRefund', () => {
    it('throws when order not found', async () => {
      mocks.order.findUnique.mockResolvedValueOnce(null)
      await expect(OrderLifecycleService.requestRefund('order-1'))
        .rejects.toThrow('订单不存在')
    })

    it('throws when status not paid/shipped', async () => {
      mocks.order.findUnique.mockResolvedValueOnce({ id: 'order-1', status: 'pending', items: [] } as any)
      await expect(OrderLifecycleService.requestRefund('order-1'))
        .rejects.toThrow('订单状态不允许退款')
    })

    it('throws when status is completed', async () => {
      mocks.order.findUnique.mockResolvedValueOnce({ id: 'order-1', status: 'completed', items: [] } as any)
      await expect(OrderLifecycleService.requestRefund('order-1'))
        .rejects.toThrow('订单状态不允许退款')
    })

    it('happy path: full refund with stock, points, balance, rewards', async () => {
      mocks.order.findUnique.mockResolvedValueOnce({
        id: 'order-1',
        status: 'paid',
        userId: 'user-1',
        orderNo: 'ORD001',
        payAmount: 500,
        pointsUsed: 100,
        items: [
          { productId: 'prod-1', quantity: 2 },
          { productId: 'prod-2', quantity: 1 },
        ],
      } as any)
      // 事务内调用
      mocks.product.update.mockResolvedValue({} as any)
      mocks.user.findUnique.mockResolvedValue({
        balance: 1000,
        consumeBalance: 500,
        earningsAvailable: 0,
        earningsPending: 0,
        earningsVoided: 0,
        frozenBalance: 0,
        totalPoints: 1000,
        unlockedPoints: 500,
        lockedPoints: 0,
      } as any)
      mocks.user.updateMany.mockResolvedValueOnce({ count: 1 } as any)
      mocks.pointsRecord.create.mockResolvedValueOnce({} as any)
      mocks.balanceRecord.create.mockResolvedValueOnce({} as any)
      vi.mocked(RewardService.processRefund).mockResolvedValueOnce({} as any)
      mocks.order.update.mockResolvedValueOnce({} as any)
      mocks.order.findUnique.mockResolvedValueOnce({ id: 'order-1', status: 'refunded' } as any)

      const result = await OrderLifecycleService.requestRefund('order-1', '质量问题')
      expect(result).toBeDefined()
      // 2 个 product 回库
      expect(mocks.product.update).toHaveBeenCalledTimes(2)
      // 积分退回
      expect(mocks.pointsRecord.create).toHaveBeenCalled()
      // 余额退回
      expect(mocks.balanceRecord.create).toHaveBeenCalled()
      // 奖励扣回
      expect(RewardService.processRefund).toHaveBeenCalledWith('order-1')
    })

    it('skips points refund when pointsUsed=0', async () => {
      mocks.order.findUnique.mockResolvedValueOnce({
        id: 'order-1',
        status: 'paid',
        userId: 'user-1',
        orderNo: 'ORD001',
        payAmount: 500,
        pointsUsed: 0,
        items: [],
      } as any)
      mocks.user.updateMany.mockResolvedValueOnce({ count: 1 } as any)
      mocks.balanceRecord.create.mockResolvedValueOnce({} as any)
      vi.mocked(RewardService.processRefund).mockResolvedValueOnce({} as any)
      mocks.order.update.mockResolvedValueOnce({} as any)
      mocks.order.findUnique.mockResolvedValueOnce({} as any)

      await OrderLifecycleService.requestRefund('order-1')
      expect(mocks.pointsRecord.create).not.toHaveBeenCalled()
    })

    it('skips balance refund when payAmount=0', async () => {
      mocks.order.findUnique.mockResolvedValueOnce({
        id: 'order-1',
        status: 'shipped',
        userId: 'user-1',
        orderNo: 'ORD001',
        payAmount: 0,
        pointsUsed: 0,
        items: [],
      } as any)
      vi.mocked(RewardService.processRefund).mockResolvedValueOnce({} as any)
      mocks.order.update.mockResolvedValueOnce({} as any)
      mocks.order.findUnique.mockResolvedValueOnce({} as any)

      await OrderLifecycleService.requestRefund('order-1')
      expect(mocks.balanceRecord.create).not.toHaveBeenCalled()
    })

    it('throws when consumeBalance insufficient', async () => {
      mocks.order.findUnique.mockResolvedValueOnce({
        id: 'order-1',
        status: 'paid',
        userId: 'user-1',
        orderNo: 'ORD001',
        payAmount: 500,
        pointsUsed: 0,
        items: [],
      } as any)
      mocks.user.updateMany.mockResolvedValueOnce({ count: 0 } as any) // 余额不足

      await expect(OrderLifecycleService.requestRefund('order-1'))
        .rejects.toThrow('消费余额不足')
    })
  })

  // ============ cancelOrder ============
  describe('cancelOrder', () => {
    it('throws when order not found', async () => {
      mocks.order.findUnique.mockResolvedValueOnce(null)
      await expect(OrderLifecycleService.cancelOrder('order-1'))
        .rejects.toThrow('订单不存在')
    })

    it('throws when status not pending', async () => {
      mocks.order.findUnique.mockResolvedValueOnce({ id: 'order-1', status: 'paid', items: [] } as any)
      await expect(OrderLifecycleService.cancelOrder('order-1'))
        .rejects.toThrow('订单状态不允许取消')
    })

    it('happy path: cancel pending order with stock + points refund', async () => {
      mocks.order.findUnique
        .mockResolvedValueOnce({ id: 'order-1', status: 'pending', userId: 'user-1', orderNo: 'ORD001', payAmount: 0, pointsUsed: 100, items: [{ productId: 'prod-1', quantity: 1 }] } as any)
        .mockResolvedValueOnce({ id: 'order-1', status: 'cancelled' } as any) // 通知前查
        .mockResolvedValueOnce({ id: 'order-1', status: 'cancelled' } as any) // 最终返回
      mocks.product.update.mockResolvedValue({} as any)
      mocks.user.findUnique.mockResolvedValue({ totalPoints: 1000, unlockedPoints: 500, lockedPoints: 0 } as any)
      mocks.user.update.mockResolvedValue({} as any)
      mocks.pointsRecord.create.mockResolvedValueOnce({} as any)
      mocks.order.update.mockResolvedValueOnce({} as any)
      vi.mocked(OrderNotificationService.notifyOrderCancelled).mockResolvedValueOnce({} as any)

      const result = await OrderLifecycleService.cancelOrder('order-1')
      expect(result).toBeDefined()
      expect(OrderNotificationService.notifyOrderCancelled).toHaveBeenCalledWith({
        orderId: 'order-1',
        reason: '您主动取消',
      })
    })

    it('skips notification when cancelledOrder is null', async () => {
      mocks.order.findUnique
        .mockResolvedValueOnce({ id: 'order-1', status: 'pending', userId: 'user-1', orderNo: 'ORD001', payAmount: 0, pointsUsed: 0, items: [] } as any)
        .mockResolvedValueOnce(null) // 通知前查 = null
        .mockResolvedValueOnce({ id: 'order-1' } as any) // 最终返回
      mocks.order.update.mockResolvedValueOnce({} as any)

      const result = await OrderLifecycleService.cancelOrder('order-1')
      expect(result).toBeDefined()
      expect(OrderNotificationService.notifyOrderCancelled).not.toHaveBeenCalled()
    })

    it('skips points refund when pointsUsed=0', async () => {
      mocks.order.findUnique
        .mockResolvedValueOnce({ id: 'order-1', status: 'pending', userId: 'user-1', orderNo: 'ORD001', payAmount: 0, pointsUsed: 0, items: [] } as any)
        .mockResolvedValueOnce({ id: 'order-1' } as any)
        .mockResolvedValueOnce({ id: 'order-1' } as any)
      mocks.order.update.mockResolvedValueOnce({} as any)

      await OrderLifecycleService.cancelOrder('order-1')
      expect(mocks.pointsRecord.create).not.toHaveBeenCalled()
    })
  })
})