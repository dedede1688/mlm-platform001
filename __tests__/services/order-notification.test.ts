/**
 * v60.3 batch 5: order-notification.service.ts 覆盖率补全
 *
 * 该 service 13 个方法,每个都是 fetch → 检查 null → 创建 notificationBatch → sendInApp → 错误捕获 模式。
 * 统一 mock 4 个依赖: prisma.order / prisma.user / prisma.notificationBatch / sendInApp
 *
 * 测试目标:
 * - 每个方法 happy path(数据齐全 → batch.create + sendInApp 都被调用)
 * - 早期返回(数据不存在 → batch 不创建)
 * - 错误捕获(batch.create 失败 → console.error + logger.error,不抛错)
 * - 特殊业务规则(typeLabelMap 翻译、amount sign、nickname fallback、refundReason 拼接)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ===== Mock 依赖 =====
// mock sendInApp - 完全跳过(13 个 notify 都走它)
const { sendInAppMock } = vi.hoisted(() => ({
  sendInAppMock: vi.fn(),
}))
vi.mock('@/lib/notification/sendInApp', () => ({
  sendInApp: sendInAppMock,
}))

// mock logger(避免真实输出 + 验证错误日志被调)
const { loggerMock } = vi.hoisted(() => ({
  loggerMock: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))
vi.mock('@/lib/logger', () => ({ logger: loggerMock }))

// mock prisma - 4 个核心调用点
const { mockPrisma, notifications } = vi.hoisted(() => {
  return {
    mockPrisma: {
      order: {
        findUnique: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
      notificationBatch: {
        create: vi.fn(),
      },
    },
    notifications: {
      batches: [] as any[],
      sendCalls: [] as any[],
    },
  }
})
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

// 静默 console.error (用 mock 替换)
const { consoleErrorSpy } = vi.hoisted(() => ({
  consoleErrorSpy: vi.fn(),
}))
vi.spyOn(console, 'error').mockImplementation(consoleErrorSpy as any)

import { OrderNotificationService } from '@/lib/services/order-notification.service'

describe('OrderNotificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 重置 batch mock,默认返回一个有效 batch
    mockPrisma.notificationBatch.create.mockResolvedValue({ id: 'batch-1' })
    notifications.batches.length = 0
    notifications.sendCalls.length = 0
    sendInAppMock.mockImplementation(async (args: any) => {
      notifications.sendCalls.push(args)
      return { id: 'notification-1', success: true }
    })
    // 默认 batch.create 跟踪
    mockPrisma.notificationBatch.create.mockImplementation(async ({ data }: any) => {
      notifications.batches.push(data)
      return { id: 'batch-1' }
    })
  })

  // ============================================================
  // notifyOrderPaid - 订单支付
  // ============================================================
  describe('notifyOrderPaid', () => {
    it('happy path: sends order_paid with orderNo + amounts + userName', async () => {
      mockPrisma.order.findUnique.mockResolvedValueOnce({
        orderNo: 'ORD-001',
        totalAmount: 120,
        payAmount: 100,
        userId: 'user-1',
        user: { nickname: 'Tom', phone: '13800000001' },
      })

      await OrderNotificationService.notifyOrderPaid('order-1')

      expect(mockPrisma.order.findUnique).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        include: { user: true },
      })
      expect(notifications.batches[0]).toMatchObject({
        type: 'business',
        title: '订单支付通知',
        templateType: 'order_paid',
        recipientCount: 1,
        senderId: null,
      })
      expect(notifications.batches[0].content).toBe('订单 ORD-001 已支付')
      expect(notifications.sendCalls[0]).toMatchObject({
        userId: 'user-1',
        templateType: 'order_paid',
        batchId: 'batch-1',
        variables: {
          orderNo: 'ORD-001',
          orderAmount: '120.00',
          payAmount: '100.00',
          userName: 'Tom',
        },
      })
    })

    it('falls back userName to phone when nickname is null', async () => {
      mockPrisma.order.findUnique.mockResolvedValueOnce({
        orderNo: 'ORD-002',
        totalAmount: 100,
        payAmount: 100,
        userId: 'user-2',
        user: { nickname: null, phone: '13800000002' },
      })

      await OrderNotificationService.notifyOrderPaid('order-2')

      expect(notifications.sendCalls[0].variables.userName).toBe('13800000002')
    })

    it('handles order with no associated user (user=null)', async () => {
      mockPrisma.order.findUnique.mockResolvedValueOnce({
        orderNo: 'ORD-003',
        totalAmount: 100,
        payAmount: 100,
        userId: 'user-3',
        user: null,
      })

      await OrderNotificationService.notifyOrderPaid('order-3')

      expect(notifications.sendCalls[0].variables.userName).toBeUndefined()
    })

    it('returns early when order not found', async () => {
      mockPrisma.order.findUnique.mockResolvedValueOnce(null)

      await OrderNotificationService.notifyOrderPaid('nonexistent')

      expect(mockPrisma.notificationBatch.create).not.toHaveBeenCalled()
      expect(sendInAppMock).not.toHaveBeenCalled()
    })

    it('catches error when batch.create rejects', async () => {
      mockPrisma.order.findUnique.mockResolvedValueOnce({
        orderNo: 'ORD-004',
        totalAmount: 100,
        payAmount: 100,
        userId: 'user-4',
        user: { nickname: 'X' },
      })
      mockPrisma.notificationBatch.create.mockRejectedValueOnce(new Error('DB down'))

      // 不应抛出
      await expect(
        OrderNotificationService.notifyOrderPaid('order-4')
      ).resolves.toBeUndefined()
      expect(consoleErrorSpy).toHaveBeenCalled()
      expect(loggerMock.error).toHaveBeenCalledWith('站内信失败', { error: expect.any(String) })
    })
  })

  // ============================================================
  // notifyOrderShipped - 订单发货
  // ============================================================
  describe('notifyOrderShipped', () => {
    it('happy path: includes trackingNumber', async () => {
      mockPrisma.order.findUnique.mockResolvedValueOnce({
        orderNo: 'ORD-S1',
        totalAmount: 100,
        payAmount: 100,
        userId: 'user-s1',
        user: { nickname: 'Ship' },
        trackingNumber: 'SF1234567890',
      } as any)

      await OrderNotificationService.notifyOrderShipped('order-s1')

      expect(notifications.batches[0].templateType).toBe('order_shipped')
      expect(notifications.batches[0].title).toBe('订单发货通知')
      expect(notifications.sendCalls[0].variables.trackingNumber).toBe('SF1234567890')
    })

    it('uses empty trackingNumber when missing', async () => {
      mockPrisma.order.findUnique.mockResolvedValueOnce({
        orderNo: 'ORD-S2',
        totalAmount: 100,
        payAmount: 100,
        userId: 'user-s2',
        user: { nickname: 'S' },
        // trackingNumber 缺省
      } as any)

      await OrderNotificationService.notifyOrderShipped('order-s2')

      expect(notifications.sendCalls[0].variables.trackingNumber).toBe('')
    })

    it('returns early when order not found', async () => {
      mockPrisma.order.findUnique.mockResolvedValueOnce(null)
      await OrderNotificationService.notifyOrderShipped('nonexistent')
      expect(mockPrisma.notificationBatch.create).not.toHaveBeenCalled()
    })
  })

  // ============================================================
  // notifyBalanceChange - 余额变动(6 种 typeLabel)
  // ============================================================
  describe('notifyBalanceChange', () => {
    const baseParams = {
      userId: 'user-b',
      adjustType: 'balance',
      amount: 100,
      newBalance: 1100,
      reason: '测试',
      operatorId: 'admin-1',
    }

    it('happy path: positive amount with + sign', async () => {
      await OrderNotificationService.notifyBalanceChange(baseParams)

      expect(notifications.batches[0]).toMatchObject({
        title: '账户余额变动通知',
        templateType: 'balance_change',
        senderId: 'admin-1',
      })
      expect(notifications.batches[0].content).toContain('余额调账')
      expect(notifications.sendCalls[0]).toMatchObject({
        userId: 'user-b',
        templateType: 'balance_change',
        senderId: 'admin-1',
        batchId: 'batch-1',
        variables: {
          changeType: '余额调账',
          changeAmount: '+100.00',
          newBalance: '1100.00',
          reason: '测试',
        },
      })
    })

    it('translates all 6 typeLabelMap values', async () => {
      const types = [
        { input: 'balance', expectLabel: '余额调账' },
        { input: 'frozenBalance', expectLabel: '冻结余额调账' },
        { input: 'recharge', expectLabel: '充值' },
        { input: 'consume_void', expectLabel: '消费余额作废' },
        { input: 'earnings_add', expectLabel: '收益到账' },
        { input: 'earnings_void', expectLabel: '收益作废' },
      ]

      for (const t of types) {
        await OrderNotificationService.notifyBalanceChange({
          ...baseParams,
          adjustType: t.input,
        })
        const lastCall = notifications.sendCalls[notifications.sendCalls.length - 1]
        expect(lastCall.variables.changeType).toBe(t.expectLabel)
      }
    })

    it('uses raw adjustType when not in typeLabelMap', async () => {
      await OrderNotificationService.notifyBalanceChange({
        ...baseParams,
        adjustType: 'unknown_type',
      })

      expect(notifications.sendCalls[0].variables.changeType).toBe('unknown_type')
    })

    it('negative amount has no + sign (just the - from toFixed)', async () => {
      await OrderNotificationService.notifyBalanceChange({
        ...baseParams,
        amount: -50,
      })

      expect(notifications.sendCalls[0].variables.changeAmount).toBe('-50.00')
    })

    it('senderId defaults to null when operatorId not provided', async () => {
      const { operatorId, ...noOp } = baseParams
      await OrderNotificationService.notifyBalanceChange(noOp)

      expect(notifications.batches[0].senderId).toBeNull()
      expect(notifications.sendCalls[0].senderId).toBeUndefined()
    })

    // v60.3 batch 7: 补 line 149-154 - catch handler
    it('catches error when batch.create rejects (line 149-154)', async () => {
      mockPrisma.notificationBatch.create.mockRejectedValueOnce(new Error('DB down'))

      await expect(
        OrderNotificationService.notifyBalanceChange(baseParams)
      ).resolves.toBeUndefined()
      expect(consoleErrorSpy).toHaveBeenCalled()
      expect(loggerMock.error).toHaveBeenCalledWith('余额变动通知失败', { error: expect.any(String) })
    })
  })

  // ============================================================
  // notifyPointsAdjust - 积分变动
  // ============================================================
  describe('notifyPointsAdjust', () => {
    const baseParams = {
      userId: 'user-p',
      fieldLabel: '可用积分',
      amount: 50,
      newTotalPoints: 1500,
      newUnlockedPoints: 1200,
      newLockedPoints: 300,
      reason: '签到',
      operatorId: 'admin-p',
    }

    it('happy path: includes all 3 point totals', async () => {
      await OrderNotificationService.notifyPointsAdjust(baseParams)

      expect(notifications.batches[0]).toMatchObject({
        title: '账户积分变动通知',
        templateType: 'points_adjust',
      })
      expect(notifications.sendCalls[0].variables).toEqual({
        fieldLabel: '可用积分',
        changeAmount: '+50',
        newTotalPoints: '1500',
        newUnlockedPoints: '1200',
        newLockedPoints: '300',
        reason: '签到',
      })
    })

    it('content references fieldLabel and total points', async () => {
      await OrderNotificationService.notifyPointsAdjust(baseParams)

      expect(notifications.batches[0].content).toBe('可用积分 +50 积分，当前总积分 1500')
    })

    it('negative amount: no + sign', async () => {
      await OrderNotificationService.notifyPointsAdjust({
        ...baseParams,
        amount: -20,
      })

      expect(notifications.sendCalls[0].variables.changeAmount).toBe('-20')
    })

    // v60.3 batch 7: 补 line 199-204 - catch handler
    it('catches error when batch.create rejects (line 199-204)', async () => {
      mockPrisma.notificationBatch.create.mockRejectedValueOnce(new Error('DB down'))

      await expect(
        OrderNotificationService.notifyPointsAdjust(baseParams)
      ).resolves.toBeUndefined()
      expect(loggerMock.error).toHaveBeenCalledWith('积分变动通知失败', { error: expect.any(String) })
    })
  })

  // ============================================================
  // notifyPointsUnlock - 每日积分解锁
  // ============================================================
  describe('notifyPointsUnlock', () => {
    it('happy path: 4 variables', async () => {
      await OrderNotificationService.notifyPointsUnlock({
        userId: 'user-pu',
        unlockAmount: 30,
        newUnlockedPoints: 800,
        newLockedPoints: 200,
        completedDays: 5,
      })

      expect(notifications.batches[0]).toMatchObject({
        title: '每日积分解锁通知',
        templateType: 'points_unlock',
        recipientCount: 1,
      })
      // v57.4: notifyPointsUnlock 源码不传 senderId(无 operatorId 概念)
      expect(notifications.batches[0].senderId).toBeUndefined()
      expect(notifications.batches[0].content).toContain('积分自动解锁 30')
      expect(notifications.sendCalls[0]).toMatchObject({
        userId: 'user-pu',
        templateType: 'points_unlock',
        variables: {
          unlockAmount: '30',
          newUnlockedPoints: '800',
          newLockedPoints: '200',
          completedDays: '5',
        },
      })
    })
  })

  // ============================================================
  // notifyRefundReview - 退款审核 approve/reject
  // ============================================================
  describe('notifyRefundReview', () => {
    it('approve action: result=通过, no refundReason', async () => {
      await OrderNotificationService.notifyRefundReview({
        userId: 'user-r',
        refundId: 'refund-1',
        action: 'approve',
        operatorId: 'admin-r',
      })

      expect(notifications.batches[0].title).toBe('退款审核通过通知')
      expect(notifications.batches[0].content).toBe('退款申请已通过')
      expect(notifications.sendCalls[0].variables).toEqual({
        result: '通过',
        refundId: 'refund-1',
        refundReason: '',
      })
    })

    it('reject action with adminComment: result=拒绝, refundReason appended', async () => {
      await OrderNotificationService.notifyRefundReview({
        userId: 'user-r',
        refundId: 'refund-2',
        action: 'reject',
        adminComment: '凭证不足',
        operatorId: 'admin-r',
      })

      expect(notifications.batches[0].title).toBe('退款审核拒绝通知')
      expect(notifications.batches[0].content).toBe('退款申请已拒绝，原因：凭证不足')
      expect(notifications.sendCalls[0].variables.refundReason).toBe('，原因：凭证不足')
    })

    it('reject action without adminComment: empty refundReason', async () => {
      await OrderNotificationService.notifyRefundReview({
        userId: 'user-r',
        refundId: 'refund-3',
        action: 'reject',
      })

      expect(notifications.sendCalls[0].variables.refundReason).toBe('')
    })

    // v60.3 batch 7: 补 line 287-292 - refund review catch handler
    it('catches error when batch.create rejects (line 287-292)', async () => {
      mockPrisma.notificationBatch.create.mockRejectedValueOnce(new Error('DB down'))

      await expect(
        OrderNotificationService.notifyRefundReview({
          userId: 'user-r', refundId: 'refund-err', action: 'approve',
        })
      ).resolves.toBeUndefined()
      expect(loggerMock.error).toHaveBeenCalledWith('退款审核通知失败', { error: expect.any(String) })
    })
  })

  // ============================================================
  // notifyRefundCompleted - 退款完成
  // ============================================================
  describe('notifyRefundCompleted', () => {
    it('happy path: orderNo + amount(2 decimals)', async () => {
      await OrderNotificationService.notifyRefundCompleted({
        userId: 'user-rc',
        orderId: 'order-rc',
        orderNo: 'ORD-RC',
        amount: 99.9,
        operatorId: 'admin-rc',
      })

      expect(notifications.batches[0]).toMatchObject({
        title: '退款完成通知',
        templateType: 'refund_completed',
        senderId: 'admin-rc',
      })
      expect(notifications.batches[0].content).toBe('订单 ORD-RC 退款 ¥99.90 已完成')
      expect(notifications.sendCalls[0].variables).toEqual({
        orderNo: 'ORD-RC',
        amount: '99.90',
      })
    })

    // v60.3 batch 7: 补 line 329-334 - refund completed catch
    it('catches error when batch.create rejects (line 329-334)', async () => {
      mockPrisma.notificationBatch.create.mockRejectedValueOnce(new Error('DB down'))

      await expect(
        OrderNotificationService.notifyRefundCompleted({
          userId: 'user-rc', orderId: 'order-rc', orderNo: 'ORD-RC', amount: 100,
        })
      ).resolves.toBeUndefined()
      expect(loggerMock.error).toHaveBeenCalledWith('退款完成通知失败', { error: expect.any(String) })
    })
  })

  // ============================================================
  // notifyRefundSubmitted - 退款申请提交(独立 IIFE,无嵌套 await)
  // ============================================================
  describe('notifyRefundSubmitted', () => {
    it('uses nickname when available', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        nickname: 'Submitter',
        phone: '13900000001',
      })

      await OrderNotificationService.notifyRefundSubmitted({
        userId: 'user-rs',
        refundId: 'refund-rs',
        orderId: 'order-rs',
        orderNo: 'ORD-RS',
        amount: 50,
      })

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-rs' },
        select: { nickname: true, phone: true },
      })
      expect(notifications.sendCalls[0].variables.userName).toBe('Submitter')
      expect(notifications.batches[0].templateType).toBe('refund_submitted')
    })

    it('falls back to phone when nickname is null', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        nickname: null,
        phone: '13900000002',
      })

      await OrderNotificationService.notifyRefundSubmitted({
        userId: 'user-rs2',
        refundId: 'refund-rs2',
        orderId: 'order-rs2',
        orderNo: 'ORD-RS2',
        amount: 60,
      })

      expect(notifications.sendCalls[0].variables.userName).toBe('13900000002')
    })

    it('falls back to "用户" when both nickname and phone missing', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        nickname: null,
        phone: null,
      })

      await OrderNotificationService.notifyRefundSubmitted({
        userId: 'user-rs3',
        refundId: 'refund-rs3',
        orderId: 'order-rs3',
        orderNo: 'ORD-RS3',
        amount: 70,
      })

      expect(notifications.sendCalls[0].variables.userName).toBe('用户')
    })

    it('falls back to "用户" when user not found in DB', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null)

      await OrderNotificationService.notifyRefundSubmitted({
        userId: 'user-rs4',
        refundId: 'refund-rs4',
        orderId: 'order-rs4',
        orderNo: 'ORD-RS4',
        amount: 80,
      })

      expect(notifications.sendCalls[0].variables.userName).toBe('用户')
    })

    it('catches and logs error', async () => {
      mockPrisma.user.findUnique.mockRejectedValueOnce(new Error('DB error'))

      await expect(
        OrderNotificationService.notifyRefundSubmitted({
          userId: 'user-rs5',
          refundId: 'refund-rs5',
          orderId: 'order-rs5',
          orderNo: 'ORD-RS5',
          amount: 90,
        })
      ).resolves.toBeUndefined()

      expect(consoleErrorSpy).toHaveBeenCalled()
      expect(loggerMock.error).toHaveBeenCalledWith('发送退款申请站内信失败', expect.any(Object))
    })
  })

  // ============================================================
  // notifyOrderCompleted - 订单完成
  // ============================================================
  describe('notifyOrderCompleted', () => {
    it('happy path', async () => {
      mockPrisma.order.findUnique.mockResolvedValueOnce({
        orderNo: 'ORD-OC',
        userId: 'user-oc',
        user: { nickname: 'Fin', phone: '13900000003' },
      })

      await OrderNotificationService.notifyOrderCompleted('order-oc')

      expect(notifications.batches[0].templateType).toBe('order_completed')
      expect(notifications.sendCalls[0].variables.userName).toBe('Fin')
    })

    it('uses phone when nickname is null', async () => {
      mockPrisma.order.findUnique.mockResolvedValueOnce({
        orderNo: 'ORD-OC2',
        userId: 'user-oc2',
        user: { nickname: null, phone: '13900000004' },
      })

      await OrderNotificationService.notifyOrderCompleted('order-oc2')

      expect(notifications.sendCalls[0].variables.userName).toBe('13900000004')
    })

    it('uses empty string when both nickname and phone missing', async () => {
      mockPrisma.order.findUnique.mockResolvedValueOnce({
        orderNo: 'ORD-OC3',
        userId: 'user-oc3',
        user: { nickname: null, phone: null },
      })

      await OrderNotificationService.notifyOrderCompleted('order-oc3')

      expect(notifications.sendCalls[0].variables.userName).toBe('')
    })

    it('returns early when order not found', async () => {
      mockPrisma.order.findUnique.mockResolvedValueOnce(null)
      await OrderNotificationService.notifyOrderCompleted('nonexistent')
      expect(mockPrisma.notificationBatch.create).not.toHaveBeenCalled()
    })

    // v60.3 batch 7: 补 line 415-420 - order completed catch
    it('catches error when batch.create rejects (line 415-420)', async () => {
      mockPrisma.order.findUnique.mockResolvedValueOnce({
        orderNo: 'ORD-OC-ERR', userId: 'u-err', user: { nickname: 'X' },
      })
      mockPrisma.notificationBatch.create.mockRejectedValueOnce(new Error('DB down'))

      await expect(
        OrderNotificationService.notifyOrderCompleted('order-err')
      ).resolves.toBeUndefined()
      expect(loggerMock.error).toHaveBeenCalledWith('订单完成通知失败', { error: expect.any(String) })
    })
  })

  // ============================================================
  // notifyOrderCancelled - 订单取消
  // ============================================================
  describe('notifyOrderCancelled', () => {
    it('uses default "管理员操作" when reason not provided', async () => {
      mockPrisma.order.findUnique.mockResolvedValueOnce({
        orderNo: 'ORD-CX',
        userId: 'user-cx',
        user: { nickname: 'C' },
      })

      await OrderNotificationService.notifyOrderCancelled({ orderId: 'order-cx' })

      expect(notifications.batches[0].templateType).toBe('order_cancelled')
      expect(notifications.batches[0].title).toBe('订单取消通知')
      expect(notifications.sendCalls[0].variables.reason).toBe('管理员操作')
    })

    it('uses provided reason', async () => {
      mockPrisma.order.findUnique.mockResolvedValueOnce({
        orderNo: 'ORD-CX2',
        userId: 'user-cx2',
        user: { nickname: 'C' },
      })

      await OrderNotificationService.notifyOrderCancelled({
        orderId: 'order-cx2',
        reason: '用户主动取消',
      })

      expect(notifications.sendCalls[0].variables.reason).toBe('用户主动取消')
    })

    it('returns early when order not found', async () => {
      mockPrisma.order.findUnique.mockResolvedValueOnce(null)
      await OrderNotificationService.notifyOrderCancelled({ orderId: 'nonexistent' })
      expect(mockPrisma.notificationBatch.create).not.toHaveBeenCalled()
    })

    // v60.3 batch 7: 补 line 457-462 - order cancelled catch
    it('catches error when batch.create rejects (line 457-462)', async () => {
      mockPrisma.order.findUnique.mockResolvedValueOnce({
        orderNo: 'ORD-CX-ERR', userId: 'u-err', user: { nickname: 'X' },
      })
      mockPrisma.notificationBatch.create.mockRejectedValueOnce(new Error('DB down'))

      await expect(
        OrderNotificationService.notifyOrderCancelled({ orderId: 'order-cx-err' })
      ).resolves.toBeUndefined()
      expect(loggerMock.error).toHaveBeenCalledWith('订单取消通知失败', { error: expect.any(String) })
    })
  })

  // ============================================================
  // notifyUserStatusChange - 账户状态变更(active/frozen)
  // ============================================================
  describe('notifyUserStatusChange', () => {
    it('status=active: statusLabel=解封', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        nickname: 'UserX',
        phone: '13900000005',
      })

      await OrderNotificationService.notifyUserStatusChange({
        userId: 'user-s',
        status: 'active',
        reason: '申诉通过',
        operatorId: 'admin-s',
      })

      expect(notifications.batches[0].title).toBe('账户解封通知')
      expect(notifications.batches[0].templateType).toBe('user_status_change')
      expect(notifications.batches[0].content).toBe('您的账户已被解封，原因：申诉通过')
      expect(notifications.sendCalls[0].variables.statusLabel).toBe('解封')
    })

    it('status=frozen: statusLabel=冻结', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        nickname: 'UserY',
        phone: '13900000006',
      })

      await OrderNotificationService.notifyUserStatusChange({
        userId: 'user-s2',
        status: 'frozen',
        reason: '风控',
      })

      expect(notifications.sendCalls[0].variables.statusLabel).toBe('冻结')
    })

    it('returns early when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null)
      await OrderNotificationService.notifyUserStatusChange({
        userId: 'nonexistent',
        status: 'active',
        reason: '测试',
      })
      expect(mockPrisma.notificationBatch.create).not.toHaveBeenCalled()
    })

    it('falls back to empty userName when both nickname and phone missing', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        nickname: null,
        phone: null,
      })

      await OrderNotificationService.notifyUserStatusChange({
        userId: 'user-s3',
        status: 'active',
        reason: '测试',
      })

      expect(notifications.sendCalls[0].variables.userName).toBe('')
    })

    // v60.3 batch 7: 补 line 505-510 - user status change catch
    it('catches error when batch.create rejects (line 505-510)', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ nickname: 'X', phone: null })
      mockPrisma.notificationBatch.create.mockRejectedValueOnce(new Error('DB down'))

      await expect(
        OrderNotificationService.notifyUserStatusChange({
          userId: 'user-s', status: 'active', reason: 'test',
        })
      ).resolves.toBeUndefined()
      expect(loggerMock.error).toHaveBeenCalledWith('账户状态变更通知失败', { error: expect.any(String) })
    })
  })

  // ============================================================
  // notifyPointsVoid - 积分作废
  // ============================================================
  describe('notifyPointsVoid', () => {
    it('happy path', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        nickname: 'Void',
        phone: '13900000007',
      })

      await OrderNotificationService.notifyPointsVoid({
        userId: 'user-v',
        amount: 100,
        reason: '订单取消',
        remainingPoints: 500,
        operatorId: 'admin-v',
      })

      expect(notifications.batches[0]).toMatchObject({
        title: '积分作废通知',
        templateType: 'points_void',
      })
      expect(notifications.sendCalls[0]).toMatchObject({
        userId: 'user-v',
        templateType: 'points_void',
        senderId: 'admin-v',
        variables: {
          userName: 'Void',
          amount: '100',
          reason: '订单取消',
          remainingPoints: '500',
        },
      })
    })

    it('returns early when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null)
      await OrderNotificationService.notifyPointsVoid({
        userId: 'nonexistent',
        amount: 100,
        reason: '测试',
        remainingPoints: 0,
      })
      expect(mockPrisma.notificationBatch.create).not.toHaveBeenCalled()
    })

    // v60.3 batch 7: 补 line 554-559 - points void catch
    it('catches error when batch.create rejects (line 554-559)', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ nickname: 'X', phone: null })
      mockPrisma.notificationBatch.create.mockRejectedValueOnce(new Error('DB down'))

      await expect(
        OrderNotificationService.notifyPointsVoid({
          userId: 'user-v', amount: 100, reason: 'test', remainingPoints: 0,
        })
      ).resolves.toBeUndefined()
      expect(loggerMock.error).toHaveBeenCalledWith('积分作废通知失败', { error: expect.any(String) })
    })
  })

  // ============================================================
  // notifyManualReward - 手动奖励到账
  // ============================================================
  describe('notifyManualReward', () => {
    it('happy path: amount 2 decimals', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        nickname: 'Reward',
        phone: '13900000008',
      })

      await OrderNotificationService.notifyManualReward({
        userId: 'user-rw',
        amount: 200.5,
        reason: '运营奖励',
        operatorId: 'admin-rw',
      })

      expect(notifications.batches[0]).toMatchObject({
        title: '手动奖励到账通知',
        templateType: 'manual_reward',
      })
      expect(notifications.batches[0].content).toBe('您收到一笔手动奖励 ¥200.50，原因：运营奖励')
      expect(notifications.sendCalls[0].variables).toEqual({
        userName: 'Reward',
        amount: '200.50',
        reason: '运营奖励',
      })
    })

    it('returns early when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null)
      await OrderNotificationService.notifyManualReward({
        userId: 'nonexistent',
        amount: 100,
        reason: '测试',
      })
      expect(mockPrisma.notificationBatch.create).not.toHaveBeenCalled()
    })

    it('falls back to phone when nickname missing', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        nickname: null,
        phone: '13900000009',
      })

      await OrderNotificationService.notifyManualReward({
        userId: 'user-rw2',
        amount: 100,
        reason: '测试',
      })

      expect(notifications.sendCalls[0].variables.userName).toBe('13900000009')
    })

    // v60.3 batch 7: 补 line 601-606 - manual reward catch
    it('catches error when batch.create rejects (line 601-606)', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ nickname: 'X', phone: null })
      mockPrisma.notificationBatch.create.mockRejectedValueOnce(new Error('DB down'))

      await expect(
        OrderNotificationService.notifyManualReward({
          userId: 'user-rw', amount: 100, reason: 'test',
        })
      ).resolves.toBeUndefined()
      expect(loggerMock.error).toHaveBeenCalledWith('手动奖励通知失败', { error: expect.any(String) })
    })
  })
})
