import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const source = fs.readFileSync(
  path.resolve(process.cwd(), 'src/app/dashboard/orders/[id]/refund/page.tsx'),
  'utf8'
)

function extractBracedBlock(input: string, marker: string): string {
  const markerIndex = input.indexOf(marker)
  expect(markerIndex, `未找到标记 "${marker}"`).toBeGreaterThanOrEqual(0)
  const start = input.indexOf('{', markerIndex)
  expect(start, `标记 "${marker}" 后未找到 "{"`).toBeGreaterThan(markerIndex)
  let depth = 0
  for (let index = start; index < input.length; index += 1) {
    if (input[index] === '{') depth += 1
    if (input[index] === '}') depth -= 1
    if (depth === 0) return input.slice(start, index + 1)
  }
  throw new Error(`未找到 ${marker} 的完整函数体`)
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: 'test-order-id' }),
}))

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: any) => React.createElement('img', { src, alt, ...props }),
}))

vi.mock('@/lib/supabase/client', () => ({
  supabaseBrowserClient: null,
  isSupabaseAvailable: () => false,
}))

import RefundApplyPage from '@/app/dashboard/orders/[id]/refund/page'

describe('退款申请页面凭证规则', () => {
  it('页面导入共享校验模块', () => {
    expect(source).toContain("from '@/lib/refunds/refund-validation'")
  })

  it('handleSubmit 在 fetch 前执行共享校验并在失败时 return', () => {
    const block = extractBracedBlock(source, 'const handleSubmit')
    expect(block).toContain('validateRefundApplication')
    expect(block.indexOf('validateRefundApplication')).toBeLessThan(block.indexOf('fetch('))
    expect(block).toContain('if (!validation.success)')
    expect(block).toContain('setError(validation.error)')
    expect(block).toMatch(/if \(!validation\.success\)[\s\S]*?return/)
  })

  it('校验失败时 return 不发请求', () => {
    const block = extractBracedBlock(source, 'const handleSubmit')
    const returnMatch = block.match(/if \(!validation\.success\)[\s\S]*?return/)
    expect(returnMatch).not.toBeNull()
    const returnIndex = block.indexOf(returnMatch![0])
    const fetchIndex = block.indexOf('fetch(')
    expect(returnIndex).toBeLessThan(fetchIndex)
  })

  it('动态标记由共享规则函数驱动', () => {
    expect(source).toContain('refundReasonRequiresImages(form.reason)')
    expect(source).toContain('refundReasonRequiresDescription(form.reason)')
    expect(source).toContain('该退款原因至少需要上传1张凭证图片')
  })

  it('质量问题/商品损坏显示图片必填提示', () => {
    expect(source).toContain('该退款原因至少需要上传1张凭证图片')
  })

  it('其他显示说明必填提示', () => {
    expect(source).toContain('refundReasonRequiresDescription')
  })

  it('重新申请不读取历史退款图片或说明作为默认值', () => {
    const formInit = extractBracedBlock(source, 'useState<RefundForm>')
    expect(formInit).toContain("reason: ''")
    expect(formInit).toContain("description: ''")
    expect(formInit).toContain('images: []')
    expect(source).not.toContain('refundRequest')
    expect(source).not.toContain('previousRefund')
  })

  it('切换原因不会清空本次已选图片', () => {
    const block = extractBracedBlock(source, 'const handleReasonChange')
    expect(block).not.toContain('images: []')
    expect(block).toContain('setError(null)')
  })

  it('请求体使用校验后的规范化数据', () => {
    const block = extractBracedBlock(source, 'const handleSubmit')
    expect(block).toContain('validation.data.reason')
    expect(block).toContain('validation.data.description')
    expect(block).toContain('validation.data.images')
  })
})

describe('P1-A：提交按钮禁用状态与共享校验一致', () => {
  it('提交按钮 disabled 同时包含 submitting 和共享校验结果', () => {
    const submitButtonMatch = source.match(/disabled=\{[^}]+\}/g)
    const submitDisabledAttr = submitButtonMatch?.find(
      (attr) => source.indexOf(attr) > source.indexOf('onClick={handleSubmit}')
    )
    expect(submitDisabledAttr).toBeDefined()
    expect(submitDisabledAttr!).toContain('submitting')
    expect(submitDisabledAttr!).toContain('formInvalid')
  })

  it('组件渲染期间计算共享校验结果', () => {
    expect(source).toContain('currentValidation')
    expect(source).toContain('formInvalid')
    expect(source).toMatch(/const currentValidation\s*=\s*validateRefundApplication\(form\)/)
    expect(source).toMatch(/const formInvalid\s*=\s*!currentValidation\.success/)
  })

  it('handleSubmit 仍保留独立的二次校验', () => {
    const block = extractBracedBlock(source, 'const handleSubmit')
    const validationCalls = block.match(/validateRefundApplication/g)
    expect(validationCalls).not.toBeNull()
    expect(validationCalls!.length).toBeGreaterThanOrEqual(1)
  })
})

describe('P1-B：真实初始渲染与空表单证据', () => {
  it('初始渲染时"提交申请"按钮为 disabled', () => {
    const html = renderToStaticMarkup(React.createElement(RefundApplyPage))
    const buttonMatches = html.match(/<button[^>]*>[\s\S]*?<\/button>/g)
    expect(buttonMatches).not.toBeNull()

    const submitButtons = buttonMatches!.filter((btn) => btn.includes('提交申请'))
    expect(submitButtons.length).toBe(1)

    const submitButton = submitButtons[0]
    expect(submitButton).toContain('disabled')
  })

  it('初始渲染时补充说明 textarea 为空', () => {
    const html = renderToStaticMarkup(React.createElement(RefundApplyPage))
    const textareaMatches = html.match(/<textarea[^>]*>[\s\S]*?<\/textarea>/g)
    expect(textareaMatches).not.toBeNull()
    expect(textareaMatches!.length).toBeGreaterThanOrEqual(1)

    const descTextarea = textareaMatches!.find((ta) =>
      ta.includes('请详细描述退款原因')
    )
    expect(descTextarea).toBeDefined()
    const innerContent = descTextarea!.replace(/<textarea[^>]*>/, '').replace(/<\/textarea>/, '')
    expect(innerContent.trim()).toBe('')
  })

  it('初始渲染时没有凭证预览图片', () => {
    const html = renderToStaticMarkup(React.createElement(RefundApplyPage))
    const imgMatches = html.match(/<img[^>]*alt="凭证/g)
    expect(imgMatches).toBeNull()
  })

  it('初始原因是"请选择退款原因"', () => {
    const html = renderToStaticMarkup(React.createElement(RefundApplyPage))
    const selectMatches = html.match(/<select[^>]*>[\s\S]*?<\/select>/g)
    expect(selectMatches).not.toBeNull()

    const reasonSelect = selectMatches!.find((s) => s.includes('请选择退款原因'))
    expect(reasonSelect).toBeDefined()
    expect(reasonSelect!).toContain('selected')
    expect(reasonSelect!).toContain('请选择退款原因')
  })

  it('初始化 useEffect 不向表单写入历史数据', () => {
    const effectBlocks: string[] = []
    let searchFrom = 0
    while (searchFrom < source.length) {
      const useEffectIndex = source.indexOf('useEffect(', searchFrom)
      if (useEffectIndex === -1) break
      const block = extractBracedBlock(source.substring(useEffectIndex), 'useEffect(')
      effectBlocks.push(block)
      searchFrom = useEffectIndex + block.length
    }

    expect(effectBlocks.length).toBeGreaterThanOrEqual(1)

    for (const block of effectBlocks) {
      expect(block).not.toContain('setForm')
    }
  })

  it('页面不从 URL 查询参数读取退款说明和图片', () => {
    expect(source).not.toContain('useSearchParams')
    expect(source).not.toContain('URLSearchParams')
    expect(source).not.toContain('searchParams')
  })

  it('页面不从 sessionStorage 读取退款说明和图片', () => {
    expect(source).not.toContain('sessionStorage')
  })

  it('页面不从 localStorage 读取退款说明和图片（鉴权 token 除外）', () => {
    const localStorageMatches = source.match(/localStorage\.\w+\([^)]*\)/g)
    expect(localStorageMatches).not.toBeNull()
    for (const match of localStorageMatches!) {
      expect(match).toContain('token')
    }
  })

  it('页面不从订单详情 API 响应读取退款说明和图片', () => {
    const fetchMatches = source.match(/fetch\([^)]+\)/g)
    expect(fetchMatches).not.toBeNull()
    expect(fetchMatches!.length).toBe(1)
    expect(fetchMatches![0]).toContain('/refund')
    expect(fetchMatches![0]).toContain('POST')
  })

  it('页面不含任何可能的历史数据回填变量', () => {
    const suspiciousPatterns = [
      'previousApplication',
      'refillFrom',
      'initialRefund',
      'preloadedRefund',
      'cachedRefund',
      'lastRefund',
      'latestRefund',
      'refund_history',
      'previousApplication',
      'refillData',
      'prefillData',
    ]
    for (const pattern of suspiciousPatterns) {
      expect(source).not.toContain(pattern)
    }
  })
})
