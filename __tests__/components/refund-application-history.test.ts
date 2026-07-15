import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: any) => React.createElement('img', { src, alt, ...props }),
}))

import RefundApplicationHistory, {
  buildRefundAttemptView,
} from '@/components/admin/refunds/RefundApplicationHistory'

const records = [
  {
    id: 'refund-2', reason: '商品损坏', description: '第二次新凭证',
    images: ['https://example.com/second.jpg'], status: 'pending',
    adminComment: null, createdAt: '2026-07-15T10:00:00Z',
  },
  {
    id: 'refund-1', reason: '质量问题', description: '第一次凭证',
    images: ['https://example.com/first.jpg'], status: 'rejected',
    adminComment: '图片无法证明问题', createdAt: '2026-07-14T10:00:00Z',
  },
]

describe('buildRefundAttemptView', () => {
  it('按真实时间顺序计算当前为第2次申请', () => {
    const view = buildRefundAttemptView(records, 'refund-2')
    expect(view.currentAttemptNumber).toBe(2)
    expect(view.previousRecords[0].attemptNumber).toBe(1)
  })

  it('只有一条记录时当前为第1次申请且无历史', () => {
    const single = [records[0]]
    const view = buildRefundAttemptView(single, 'refund-2')
    expect(view.currentAttemptNumber).toBe(1)
    expect(view.previousRecords).toHaveLength(0)
  })

  it('历史记录按倒序排列（最近在前）', () => {
    const threeRecords = [
      { ...records[1], id: 'refund-0', createdAt: '2026-07-13T10:00:00Z' },
      ...records,
    ]
    const view = buildRefundAttemptView(threeRecords, 'refund-2')
    expect(view.previousRecords).toHaveLength(2)
    expect(view.previousRecords[0].attemptNumber).toBe(2)
    expect(view.previousRecords[1].attemptNumber).toBe(1)
  })
})

describe('RefundApplicationHistory component', () => {
  it('历史区域显示第一次申请自己的文字图片状态和备注', () => {
    const html = renderToStaticMarkup(React.createElement(RefundApplicationHistory, {
      records,
      currentRefundId: 'refund-2',
      formatTime: (value: string) => value,
    }))
    expect(html).toContain('历史申请记录（共1次）')
    expect(html).toContain('第1次申请')
    expect(html).toContain('第一次凭证')
    expect(html).toContain('first.jpg')
    expect(html).toContain('图片无法证明问题')
    expect(html).not.toContain('second.jpg')
  })

  it('无历史记录时返回null', () => {
    const single = [records[0]]
    const html = renderToStaticMarkup(React.createElement(RefundApplicationHistory, {
      records: single,
      currentRefundId: 'refund-2',
      formatTime: (value: string) => value,
    }))
    expect(html).toBe('')
  })

  it('显示已拒绝状态标签', () => {
    const html = renderToStaticMarkup(React.createElement(RefundApplicationHistory, {
      records,
      currentRefundId: 'refund-2',
      formatTime: (value: string) => value,
    }))
    expect(html).toContain('已拒绝')
  })

  it('显示退款原因', () => {
    const html = renderToStaticMarkup(React.createElement(RefundApplicationHistory, {
      records,
      currentRefundId: 'refund-2',
      formatTime: (value: string) => value,
    }))
    expect(html).toContain('质量问题')
  })

  it('不显示空的补充说明', () => {
    const noDesc = [
      { ...records[1], description: null },
    ]
    const html = renderToStaticMarkup(React.createElement(RefundApplicationHistory, {
      records: noDesc,
      currentRefundId: 'refund-2',
      formatTime: (value: string) => value,
    }))
    expect(html).not.toContain('补充说明')
  })

  it('不显示空的管理员备注', () => {
    const noComment = [
      { ...records[1], adminComment: null },
    ]
    const html = renderToStaticMarkup(React.createElement(RefundApplicationHistory, {
      records: noComment,
      currentRefundId: 'refund-2',
      formatTime: (value: string) => value,
    }))
    expect(html).not.toContain('管理员备注')
  })
})

describe('后台退款管理页面接线契约', () => {
  const adminPageSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/app/admin/refunds/page.tsx'),
    'utf8'
  )

  it('fetchReviewHistory 携带 Bearer Token', () => {
    expect(adminPageSource).toContain('Authorization: `Bearer ${authToken}`')
  })

  it('显示加载历史申请文案', () => {
    expect(adminPageSource).toContain('正在加载历史申请')
  })

  it('显示重新获取按钮', () => {
    expect(adminPageSource).toContain('重新获取')
  })

  it('审核按钮在历史未就绪时禁用', () => {
    expect(adminPageSource).toContain('reviewHistoryLoading || Boolean(reviewHistoryError)')
  })

  it('拒绝原因不足5字前端拦截', () => {
    expect(adminPageSource).toContain('adminComment.trim().length < 5')
  })

  it('防止并发请求串台', () => {
    expect(adminPageSource).toContain('reviewHistoryRequestRef.current !== requestId')
  })

  it('验证历史数据包含当前申请', () => {
    expect(adminPageSource).toContain("records.some(record => record.id === item.id)")
  })

  it('渲染 RefundApplicationHistory 组件', () => {
    expect(adminPageSource).toContain('<RefundApplicationHistory')
  })

  it('handleReview 中历史未就绪时 return', () => {
    function extractBracedBlock(input: string, marker: string): string {
      const markerIndex = input.indexOf(marker)
      expect(markerIndex).toBeGreaterThanOrEqual(0)
      const start = input.indexOf('{', markerIndex)
      expect(start).toBeGreaterThan(markerIndex)
      let depth = 0
      for (let index = start; index < input.length; index += 1) {
        if (input[index] === '{') depth += 1
        if (input[index] === '}') depth -= 1
        if (depth === 0) return input.slice(start, index + 1)
      }
      throw new Error(`未找到 ${marker} 的完整函数体`)
    }

    const block = extractBracedBlock(adminPageSource, 'const handleReview')
    const historyCheckIndex = block.indexOf('reviewHistoryLoading || reviewHistoryError')
    const fetchIndex = block.indexOf('fetch(`/api/admin/refunds/')
    expect(historyCheckIndex).toBeGreaterThan(0)
    expect(fetchIndex).toBeGreaterThan(0)
    expect(historyCheckIndex).toBeLessThan(fetchIndex)
  })
})