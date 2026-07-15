import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'

vi.mock('next/link', () => ({
  default: ({ children, ...props }: any) => React.createElement('a', props, children),
}))

import OrderAfterSalesCard from '@/components/orders/OrderAfterSalesCard'

type OrderRefundSummary = {
  id: string
  reason: string
  description: string | null
  images: string[] | null
  status: string
  adminComment: string | null
  createdAt: string
}

function render(props: {
  orderStatus: string
  latestRefund: OrderRefundSummary | null
  onApplyRefund?: () => void
}) {
  return renderToStaticMarkup(
    React.createElement(OrderAfterSalesCard, {
      onApplyRefund: props.onApplyRefund || (() => {}),
      ...props,
    })
  )
}

function countButtons(html: string, text: string): number {
  let count = 0
  let searchFrom = 0
  while (true) {
    const openIdx = html.indexOf('<button', searchFrom)
    if (openIdx === -1) break
    const closeIdx = html.indexOf('</button>', openIdx)
    if (closeIdx === -1) break
    const buttonContent = html.slice(openIdx, closeIdx + '</button>'.length)
    const innerStart = html.indexOf('>', openIdx) + 1
    const innerText = html.slice(innerStart, closeIdx).replace(/<[^>]*>/g, '').trim()
    if (innerText === text) count += 1
    searchFrom = closeIdx + '</button>'.length
  }
  return count
}

describe('OrderAfterSalesCard', () => {
  describe('无退款记录', () => {
    it('paid 状态下显示一个"申请退款"按钮', () => {
      const html = render({ orderStatus: 'paid', latestRefund: null })
      expect(countButtons(html, '申请退款')).toBe(1)
    })

    it('shipped 状态下显示一个"申请退款"按钮', () => {
      const html = render({ orderStatus: 'shipped', latestRefund: null })
      expect(countButtons(html, '申请退款')).toBe(1)
    })

    it('显示售后服务标题', () => {
      const html = render({ orderStatus: 'paid', latestRefund: null })
      expect(html).toContain('售后服务')
    })

    it('显示中性说明文案', () => {
      const html = render({ orderStatus: 'paid', latestRefund: null })
      expect(html).toContain('如商品存在问题')
    })
  })

  describe('pending 状态', () => {
    const pendingRefund: OrderRefundSummary = {
      id: 'r1',
      reason: '质量问题',
      description: null,
      images: null,
      status: 'pending',
      adminComment: null,
      createdAt: '2026-07-15T00:00:00Z',
    }

    it('显示"审核中"状态文字', () => {
      const html = render({ orderStatus: 'paid', latestRefund: pendingRefund })
      expect(html).toContain('审核中')
    })

    it('没有申请退款按钮', () => {
      const html = render({ orderStatus: 'paid', latestRefund: pendingRefund })
      expect(countButtons(html, '申请退款')).toBe(0)
      expect(countButtons(html, '重新申请')).toBe(0)
    })
  })

  describe('approved 状态', () => {
    const approvedRefund: OrderRefundSummary = {
      id: 'r2',
      reason: '不想要了',
      description: null,
      images: null,
      status: 'approved',
      adminComment: null,
      createdAt: '2026-07-15T00:00:00Z',
    }

    it('显示"退款处理中"状态文字', () => {
      const html = render({ orderStatus: 'paid', latestRefund: approvedRefund })
      expect(html).toContain('退款处理中')
    })

    it('没有申请退款按钮', () => {
      const html = render({ orderStatus: 'paid', latestRefund: approvedRefund })
      expect(countButtons(html, '申请退款')).toBe(0)
      expect(countButtons(html, '重新申请')).toBe(0)
    })
  })

  describe('completed 状态', () => {
    const completedRefund: OrderRefundSummary = {
      id: 'r3',
      reason: '质量问题',
      description: '商品有破损',
      images: null,
      status: 'completed',
      adminComment: null,
      createdAt: '2026-07-15T00:00:00Z',
    }

    it('显示"退款已完成"状态文字', () => {
      const html = render({ orderStatus: 'paid', latestRefund: completedRefund })
      expect(html).toContain('退款已完成')
    })

    it('没有申请退款按钮', () => {
      const html = render({ orderStatus: 'paid', latestRefund: completedRefund })
      expect(countButtons(html, '申请退款')).toBe(0)
      expect(countButtons(html, '重新申请')).toBe(0)
    })
  })

  describe('rejected 状态', () => {
    const rejectedRefund: OrderRefundSummary = {
      id: 'r4',
      reason: '不想要了',
      description: null,
      images: null,
      status: 'rejected',
      adminComment: '不符合退款条件',
      createdAt: '2026-07-15T00:00:00Z',
    }

    it('显示"申请未通过"状态文字', () => {
      const html = render({ orderStatus: 'paid', latestRefund: rejectedRefund })
      expect(html).toContain('申请未通过')
    })

    it('只有一个"重新申请"按钮', () => {
      const html = render({ orderStatus: 'paid', latestRefund: rejectedRefund })
      expect(countButtons(html, '重新申请')).toBe(1)
      expect(countButtons(html, '申请退款')).toBe(0)
    })
  })

  describe('不可退款订单状态', () => {
    it('pending 订单不显示申请退款按钮', () => {
      const html = render({ orderStatus: 'pending', latestRefund: null })
      expect(countButtons(html, '申请退款')).toBe(0)
    })

    it('completed 订单不显示申请退款按钮', () => {
      const html = render({ orderStatus: 'completed', latestRefund: null })
      expect(countButtons(html, '申请退款')).toBe(0)
    })
  })

  describe('退款详情展开', () => {
    const refundWithDetails: OrderRefundSummary = {
      id: 'r5',
      reason: '质量问题',
      description: '商品有破损',
      images: ['https://example.com/img1.jpg'],
      status: 'pending',
      adminComment: '正在处理',
      createdAt: '2026-07-15T00:00:00Z',
    }

    it('存在退款记录时显示查看详情控制', () => {
      const html = render({ orderStatus: 'paid', latestRefund: refundWithDetails })
      expect(html).toContain('查看退款详情')
    })

    it('使用 details/summary 原生元素', () => {
      const html = render({ orderStatus: 'paid', latestRefund: refundWithDetails })
      expect(html).toContain('<details')
      expect(html).toContain('<summary')
    })

    it('展开区域包含退款原因', () => {
      const html = render({ orderStatus: 'paid', latestRefund: refundWithDetails })
      expect(html).toContain('质量问题')
    })
  })

  describe('样式规范', () => {
    it('不包含满宽橙色大按钮样式', () => {
      const html = render({ orderStatus: 'paid', latestRefund: null })
      expect(html).not.toContain('bg-orange-600')
      expect(html).not.toMatch(/w-full[^"]*py-3/)
    })
  })
})