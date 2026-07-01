import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma (sendInApp 用 prisma.notificationTemplate + prisma.notification)
vi.mock('@/lib/prisma', () => {
  return {
    prisma: {
      notificationTemplate: {
        findUnique: vi.fn(),
      },
      notification: {
        create: vi.fn(),
      },
    },
  }
})

// Mock logger(避免真实输出)
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

import { prisma } from '@/lib/prisma'
import { sendInApp } from '@/lib/notification/sendInApp'

describe('sendInApp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ===== 分支 1:模板不存在
  it('returns false when template does not exist', async () => {
    prisma.notificationTemplate.findUnique.mockResolvedValueOnce(null)

    const result = await sendInApp({
      userId: 'user-1',
      templateType: 'order_paid',
      variables: { amount: '100' },
    })

    expect(result).toBe(false)
    expect(prisma.notification.create).not.toHaveBeenCalled()
  })

  // ===== 分支 2:模板已禁用
  it('returns false when template is disabled', async () => {
    prisma.notificationTemplate.findUnique.mockResolvedValueOnce({
      type: 'order_paid',
      channel: 'in_app',
      subject: '订单已支付',
      content: '您支付了 ¥{{amount}}',
      enabled: false,
    } as any)

    const result = await sendInApp({
      userId: 'user-1',
      templateType: 'order_paid',
      variables: { amount: '100' },
    })

    expect(result).toBe(false)
    expect(prisma.notification.create).not.toHaveBeenCalled()
  })

  // ===== 分支 3:正常路径,模板启用
  it('sends notification when template exists and enabled', async () => {
    prisma.notificationTemplate.findUnique.mockResolvedValueOnce({
      type: 'order_paid',
      channel: 'in_app',
      subject: '订单 {{orderNo}} 已支付',
      content: '您支付了 ¥{{amount}}',
      enabled: true,
    } as any)
    prisma.notification.create.mockResolvedValueOnce({ id: 'notif-1' } as any)

    const result = await sendInApp({
      userId: 'user-1',
      templateType: 'order_paid',
      variables: { orderNo: 'ORD001', amount: '100' },
    })

    expect(result).toBe(true)
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        type: 'order_paid',
        title: '订单 ORD001 已支付',
        content: '您支付了 ¥100',
        sourceType: 'order', // templateType.split('_')[0]
        sourceId: null,
        batchId: null,
        senderId: null,
      }),
    })
  })

  // ===== 分支 3 扩展:带 batchId + senderId
  it('passes batchId and senderId when provided', async () => {
    prisma.notificationTemplate.findUnique.mockResolvedValueOnce({
      type: 'system_announcement',
      channel: 'in_app',
      subject: '{{title}}',
      content: '{{content}}',
      enabled: true,
    } as any)
    prisma.notification.create.mockResolvedValueOnce({ id: 'notif-2' } as any)

    const result = await sendInApp({
      userId: 'user-2',
      templateType: 'system_announcement',
      variables: { title: '系统通知', content: '内容' },
      batchId: 'batch-1',
      senderId: 'admin-1',
    })

    expect(result).toBe(true)
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        batchId: 'batch-1',
        senderId: 'admin-1',
        sourceType: 'system', // templateType.split('_')[0]
      }),
    })
  })

  // ===== 分支 4:模板 subject 为 null
  it('handles null template subject gracefully', async () => {
    prisma.notificationTemplate.findUnique.mockResolvedValueOnce({
      type: 'simple_notify',
      channel: 'in_app',
      subject: null,
      content: '正文 {{x}}',
      enabled: true,
    } as any)
    prisma.notification.create.mockResolvedValueOnce({ id: 'notif-3' } as any)

    const result = await sendInApp({
      userId: 'user-3',
      templateType: 'simple_notify',
      variables: { x: 'Y' },
    })

    expect(result).toBe(true)
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: '', // null → empty string
        content: '正文 Y',
      }),
    })
  })

  // ===== 分支 5:异常路径(prisma 抛错)
  it('returns false and logs error when prisma throws', async () => {
    prisma.notificationTemplate.findUnique.mockRejectedValueOnce(new Error('DB 连接失败'))

    const result = await sendInApp({
      userId: 'user-4',
      templateType: 'order_paid',
      variables: {},
    })

    expect(result).toBe(false)
  })

  // ===== 分支 6:创建 notification 时抛错
  it('returns false when notification.create throws', async () => {
    prisma.notificationTemplate.findUnique.mockResolvedValueOnce({
      type: 'order_paid',
      channel: 'in_app',
      subject: 's',
      content: 'c',
      enabled: true,
    } as any)
    prisma.notification.create.mockRejectedValueOnce(new Error('insert failed'))

    const result = await sendInApp({
      userId: 'user-5',
      templateType: 'order_paid',
      variables: {},
    })

    expect(result).toBe(false)
  })

  // ===== 分支 7:变量替换 - 多个变量
  it('replaces multiple variables in subject and content', async () => {
    prisma.notificationTemplate.findUnique.mockResolvedValueOnce({
      type: 'withdrawal_result',
      channel: 'in_app',
      subject: '{{status}} {{amount}}',
      content: '金额:{{amount}} 原因:{{reason}}',
      enabled: true,
    } as any)
    prisma.notification.create.mockResolvedValueOnce({ id: 'notif-4' } as any)

    await sendInApp({
      userId: 'user-6',
      templateType: 'withdrawal_result',
      variables: { status: '通过', amount: '500', reason: '正常' },
    })

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: '通过 500',
        content: '金额:500 原因:正常',
      }),
    })
  })

  // ===== 分支 8:变量替换 - 同名变量多次出现
  it('replaces all occurrences of the same variable', async () => {
    prisma.notificationTemplate.findUnique.mockResolvedValueOnce({
      type: 'refund_completed',
      channel: 'in_app',
      subject: '{{amount}}',
      content: '退款 {{amount}} 已到账,共 {{amount}} 元',
      enabled: true,
    } as any)
    prisma.notification.create.mockResolvedValueOnce({ id: 'notif-5' } as any)

    await sendInApp({
      userId: 'user-7',
      templateType: 'refund_completed',
      variables: { amount: '300' },
    })

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: '300',
        content: '退款 300 已到账,共 300 元',
      }),
    })
  })
})