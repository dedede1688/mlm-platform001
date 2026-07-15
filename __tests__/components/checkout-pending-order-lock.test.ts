import { describe, it, expect, beforeAll, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'

vi.mock('@/components/ToastProvider', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/components/address/AddressPicker', () => ({
  AddressPicker: () => React.createElement('div', { 'data-testid': 'address-picker' }),
  AddressPickerValue: {},
}))
vi.mock('next/link', () => ({
  default: ({ children, ...props }: any) => React.createElement('a', props, children),
}))

const componentPath = resolve(__dirname, '../../src/components/checkout/CheckoutDialog.tsx')
let source: string

function extractBlock(src: string, startMarker: string, endMarker: string): string {
  const startIdx = src.indexOf(startMarker)
  if (startIdx === -1) {
    throw new Error(`extractBlock: start marker "${startMarker}" not found in source`)
  }
  const afterStart = startIdx + startMarker.length
  const endIdx = src.indexOf(endMarker, afterStart)
  if (endIdx === -1) {
    throw new Error(`extractBlock: end marker "${endMarker}" not found after start marker "${startMarker}"`)
  }
  return src.slice(startIdx, endIdx + endMarker.length)
}

function extractParenthesizedExpression(src: string, marker: string): string {
  const markerIndex = src.indexOf(marker)
  expect(markerIndex, `未找到标记：${marker}`).toBeGreaterThanOrEqual(0)

  const openIndex = src.indexOf('(', markerIndex)
  expect(openIndex, `未找到左括号：${marker}`).toBeGreaterThan(markerIndex)

  let depth = 0
  for (let index = openIndex; index < src.length; index += 1) {
    if (src[index] === '(') depth += 1
    if (src[index] === ')') depth -= 1
    if (depth === 0) return src.slice(markerIndex, index + 1)
  }

  throw new Error(`未找到完整括号表达式：${marker}`)
}


describe('CheckoutDialog - pending order lock contract', () => {
  beforeAll(() => {
    source = readFileSync(componentPath, 'utf-8')
  })

  it('exports CheckoutLockedShipping type with three fields', () => {
    const typeBlock = extractBlock(source, 'export interface CheckoutLockedShipping', '}')
    expect(typeBlock).toContain('recipientName: string')
    expect(typeBlock).toContain('recipientPhone: string')
    expect(typeBlock).toContain('shippingAddress: string')
  })

  it('accepts pendingOrderShipping prop of CheckoutLockedShipping | null type', () => {
    expect(source).toMatch(/pendingOrderShipping\??\s*:\s*CheckoutLockedShipping\s*\|\s*null/)
  })

  it('stores submittedShipping state', () => {
    expect(source).toMatch(/useState<CheckoutLockedShipping\s*\|\s*null>/)
    expect(source).toMatch(/setSubmittedShipping/)
  })

  it('computes lockedShipping from pendingOrderShipping ?? submittedShipping', () => {
    const line = source.split('\n').find(l => l.includes('lockedShipping') && l.includes('pendingOrderShipping'))
    expect(line).toBeDefined()
    expect(line!).toMatch(/pendingOrderShipping\s*\?\?\s*submittedShipping/)
  })

  it('shows lock message when hasPendingOrder and lockedShipping', () => {
    const jsxStart = source.indexOf('{hasPendingOrder ? (')
    expect(jsxStart).toBeGreaterThan(0)
    const afterTernary = source.substring(jsxStart)
    const lockedBranch = extractBlock(afterTernary, 'lockedShipping ? (', ') : (')
    expect(lockedBranch).toContain('订单已创建，收货信息以首次提交为准')
    expect(lockedBranch).toMatch(/lockedShipping\.recipientName/)
    expect(lockedBranch).toMatch(/lockedShipping\.recipientPhone/)
    expect(lockedBranch).toMatch(/lockedShipping\.shippingAddress/)
  })

  it('saves shipping snapshot before onConfirm call', () => {
    const handleConfirmBlock = extractBlock(source, 'const handleConfirm = async', 'setSubmitting(false)')
    expect(handleConfirmBlock).toMatch(/setSubmittedShipping/)
  })

  it('skips onSaveAddress when hasPendingOrder', () => {
    const saveBlock = extractBlock(source, 'if (!hasPendingOrder &&', '}')
    expect(saveBlock).toContain('!hasPendingOrder')
    expect(saveBlock).toContain('onSaveAddress')
  })

  it('keeps pay password outside the lock branch', () => {
    const payPwdBlock = extractBlock(source, '支付密码', '</div>')
    expect(payPwdBlock).toContain('payPassword')
  })

  describe('P0-1: handleConfirm first-level branch depends ONLY on hasPendingOrder', () => {
    it('handleConfirm first-level branch uses hasPendingOrder alone (NOT hasPendingOrder && lockedShipping)', () => {
      const handleConfirmBlock = extractBlock(source, 'const handleConfirm = async', 'setSubmitting(false)')
      const firstIfMatch = handleConfirmBlock.match(/if\s*\(\s*hasPendingOrder\s*&&\s*lockedShipping\s*\)/)
      expect(firstIfMatch, 'handleConfirm must NOT use hasPendingOrder && lockedShipping as first-level branch; use hasPendingOrder alone').toBeNull()
      const correctFirstIf = handleConfirmBlock.match(/if\s*\(\s*hasPendingOrder\s*\)/)
      expect(correctFirstIf, 'handleConfirm first-level branch must use hasPendingOrder alone').not.toBeNull()
    })

    it('handleConfirm returns with toast when lockedShipping is missing in pending mode', () => {
      const handleConfirmBlock = extractBlock(source, 'const handleConfirm = async', 'setSubmitting(false)')
      const hasPendingBranch = extractBlock(handleConfirmBlock, 'if (hasPendingOrder)', '} else {')
      expect(hasPendingBranch).toMatch(/hasCompleteLockedShipping/)
      expect(hasPendingBranch).toMatch(/return/)
      expect(hasPendingBranch).toMatch(/订单收货信息缺失|收货信息.*缺失|请联系客服/)
    })

    it('handleConfirm does NOT enter first-order validation when lockedShipping is missing', () => {
      const handleConfirmBlock = extractBlock(source, 'const handleConfirm = async', 'setSubmitting(false)')
      const hasPendingBranch = extractBlock(handleConfirmBlock, 'if (hasPendingOrder)', '} else {')
      expect(hasPendingBranch).not.toMatch(/(?<!lockedShipping\.)recipientName\.trim\(\)/)
      expect(hasPendingBranch).not.toMatch(/(?<!lockedShipping\.)recipientPhone\.trim\(\)/)
      expect(hasPendingBranch).not.toMatch(/addressPca/)
    })

    it('handleConfirm uses hasCompleteLockedShipping for pending order shipping validation', () => {
      const handleConfirmBlock = extractBlock(source, 'const handleConfirm = async', 'setSubmitting(false)')
      const hasPendingBranch = extractBlock(handleConfirmBlock, 'if (hasPendingOrder)', '} else {')
      expect(hasPendingBranch).toContain('hasCompleteLockedShipping')
    })
  })

  describe('P0-1: JSX first-level branch depends ONLY on hasPendingOrder', () => {
    it('JSX uses hasPendingOrder alone as first-level ternary (NOT hasPendingOrder && lockedShipping)', () => {
      const oldPattern = source.match(/\{hasPendingOrder\s*&&\s*lockedShipping\s*\?\s*\(/)
      expect(oldPattern, 'JSX must NOT use hasPendingOrder && lockedShipping as first-level ternary').toBeNull()
      const newPattern = source.match(/\{hasPendingOrder\s*\?\s*\(/)
      expect(newPattern, 'JSX must use hasPendingOrder alone as first-level ternary').not.toBeNull()
    })

    it('hasPendingOrder=true && lockedShipping=null shows read-only error message (NOT editable form)', () => {
      const jsxStart = source.indexOf('{hasPendingOrder ? (')
      expect(jsxStart).toBeGreaterThan(0)
      const afterTernary = source.substring(jsxStart)
      const nullBranch = extractBlock(afterTernary, ') : (', '订单收货信息缺失')
      expect(nullBranch).toContain('订单收货信息缺失')
    })

    it('hasPendingOrder=true && lockedShipping=null does NOT render address picker', () => {
      const jsxStart = source.indexOf('{hasPendingOrder ? (')
      expect(jsxStart, 'hasPendingOrder ternary must exist').toBeGreaterThan(0)
      const afterTernary = source.substring(jsxStart)
      const nullBranch = extractBlock(afterTernary, ') : (', '订单收货信息缺失')
      expect(nullBranch).not.toContain('选择收货地址')
    })

    it('hasPendingOrder=true && lockedShipping=null does NOT render recipient name input', () => {
      const jsxStart = source.indexOf('{hasPendingOrder ? (')
      expect(jsxStart, 'hasPendingOrder ternary must exist').toBeGreaterThan(0)
      const afterTernary = source.substring(jsxStart)
      const nullBranch = extractBlock(afterTernary, ') : (', '订单收货信息缺失')
      expect(nullBranch).not.toContain('收件人姓名')
    })

    it('hasPendingOrder=true && lockedShipping=null does NOT render phone input', () => {
      const jsxStart = source.indexOf('{hasPendingOrder ? (')
      expect(jsxStart, 'hasPendingOrder ternary must exist').toBeGreaterThan(0)
      const afterTernary = source.substring(jsxStart)
      const nullBranch = extractBlock(afterTernary, ') : (', '订单收货信息缺失')
      expect(nullBranch).not.toContain('手机号码')
    })

    it('hasPendingOrder=true && lockedShipping=null does NOT render province/city/district picker', () => {
      const jsxStart = source.indexOf('{hasPendingOrder ? (')
      expect(jsxStart, 'hasPendingOrder ternary must exist').toBeGreaterThan(0)
      const afterTernary = source.substring(jsxStart)
      const nullBranch = extractBlock(afterTernary, ') : (', '订单收货信息缺失')
      expect(nullBranch).not.toContain('所在地区')
    })

    it('hasPendingOrder=true && lockedShipping=null does NOT render detail address textarea', () => {
      const jsxStart = source.indexOf('{hasPendingOrder ? (')
      expect(jsxStart, 'hasPendingOrder ternary must exist').toBeGreaterThan(0)
      const afterTernary = source.substring(jsxStart)
      const nullBranch = extractBlock(afterTernary, ') : (', '订单收货信息缺失')
      expect(nullBranch).not.toContain('详细地址')
    })
  })

  describe('P0-1: confirm button disabled when lockedShipping is missing', () => {
    it('confirm button disabled includes hasCompleteLockedShipping guard when hasPendingOrder', () => {
      const buttonIdx = source.indexOf('onClick={handleConfirm}')
      expect(buttonIdx, 'confirm button must exist').toBeGreaterThan(0)
      const buttonLine = source.substring(buttonIdx, source.indexOf('>', buttonIdx) + 1)
      const disabledMatch = buttonLine.match(/disabled=\{([^}]+)\}/)
      expect(disabledMatch, 'disabled attribute must exist on confirm button').toBeDefined()
      expect(disabledMatch![1]).toMatch(/hasPendingOrder/)
      expect(disabledMatch![1]).toMatch(/hasCompleteLockedShipping/)
    })
  })

  describe('P0-1: non-pending mode preserves original address validation', () => {
    it('else branch still validates recipientName, recipientPhone, addressPca, detailAddress', () => {
      const handleConfirmBlock = extractBlock(source, 'const handleConfirm = async', 'setSubmitting(false)')
      const elseBranch = extractBlock(handleConfirmBlock, '} else {', 'payPassword')
      expect(elseBranch).toContain('recipientName.trim()')
      expect(elseBranch).toContain('recipientPhone')
      expect(elseBranch).toMatch(/addressPca/)
      expect(elseBranch).toMatch(/detailAddress/)
    })
  })

  describe('P1-A: lockedShipping blank-string fields must be rejected with .trim()', () => {
    it('handleConfirm uses hasCompleteLockedShipping (which checks trim() on all fields)', () => {
      const handleConfirmBlock = extractBlock(source, 'const handleConfirm = async', 'setSubmitting(false)')
      const hasPendingBranch = extractBlock(handleConfirmBlock, 'if (hasPendingOrder)', '} else {')
      expect(hasPendingBranch).toMatch(/hasCompleteLockedShipping/)
    })

    it('hasCompleteLockedShipping definition checks recipientName.trim()', () => {
      const varSection = extractParenthesizedExpression(source, 'hasCompleteLockedShipping')
      expect(varSection).toMatch(/recipientName.*trim/)
    })

    it('hasCompleteLockedShipping definition checks recipientPhone.trim()', () => {
      const varSection = extractParenthesizedExpression(source, 'hasCompleteLockedShipping')
      expect(varSection).toMatch(/recipientPhone.*trim/)
    })

    it('hasCompleteLockedShipping definition checks shippingAddress.trim()', () => {
      const varSection = extractParenthesizedExpression(source, 'hasCompleteLockedShipping')
      expect(varSection).toMatch(/shippingAddress.*trim/)
    })

    it('shippingSnapshot trims all three fields before submitting to onConfirm', () => {
      const handleConfirmBlock = extractBlock(source, 'const handleConfirm = async', 'setSubmitting(false)')
      const snapshotIdx = handleConfirmBlock.indexOf('shippingSnapshot')
      expect(snapshotIdx, 'shippingSnapshot must exist').toBeGreaterThan(0)
      const snapshotBlock = handleConfirmBlock.substring(snapshotIdx)
      const snapshotEnd = snapshotBlock.indexOf('setSubmittedShipping')
      expect(snapshotEnd, 'setSubmittedShipping must exist after shippingSnapshot').toBeGreaterThan(0)
      const snapshotSection = snapshotBlock.substring(0, snapshotEnd)
      expect(snapshotSection).toMatch(/recipientName:\s*lockedShipping!?\.\s*recipientName\.trim\s*\(\)/)
      expect(snapshotSection).toMatch(/recipientPhone:\s*lockedShipping!?\.\s*recipientPhone\.trim\s*\(\)/)
      expect(snapshotSection).toMatch(/shippingAddress:\s*lockedShipping!?\.\s*shippingAddress\.trim\s*\(\)/)
    })

    it('confirm button disabled includes blank-field guard for lockedShipping when hasPendingOrder', () => {
      const buttonIdx = source.indexOf('onClick={handleConfirm}')
      expect(buttonIdx, 'confirm button must exist').toBeGreaterThan(0)
      const buttonLine = source.substring(buttonIdx, source.indexOf('>', buttonIdx) + 1)
      const disabledMatch = buttonLine.match(/disabled=\{([^}]+)\}/)
      expect(disabledMatch, 'disabled attribute must exist on confirm button').toBeDefined()
      const disabledExpr = disabledMatch![1]
      expect(disabledExpr).toMatch(/hasPendingOrder/)
      expect(disabledExpr).toMatch(/hasCompleteLockedShipping/)
    })
  })

  describe('P1: hasCompleteLockedShipping unified completeness check', () => {
    it('defines hasCompleteLockedShipping variable using trim() on all three fields', () => {
      expect(source).toMatch(/hasCompleteLockedShipping/)
      const varSection = extractParenthesizedExpression(source, 'hasCompleteLockedShipping')
      expect(varSection).toMatch(/recipientName.*trim/)
      expect(varSection).toMatch(/recipientPhone.*trim/)
      expect(varSection).toMatch(/shippingAddress.*trim/)
    })

    it('JSX uses hasCompleteLockedShipping for yellow/red branch (NOT just lockedShipping truthy)', () => {
      const jsxStart = source.indexOf('{hasPendingOrder ? (')
      expect(jsxStart, 'hasPendingOrder ternary must exist').toBeGreaterThan(0)
      const afterTernary = source.substring(jsxStart)
      expect(afterTernary).toMatch(/hasCompleteLockedShipping/)
      const lockedBranchMatch = afterTernary.match(/hasCompleteLockedShipping\s*&&\s*lockedShipping/)
      expect(lockedBranchMatch, 'JSX must use hasCompleteLockedShipping && lockedShipping for yellow branch').not.toBeNull()
    })

    it('handleConfirm uses hasCompleteLockedShipping for pending order shipping validation', () => {
      const handleConfirmBlock = extractBlock(source, 'const handleConfirm = async', 'setSubmitting(false)')
      expect(handleConfirmBlock).toMatch(/hasCompleteLockedShipping/)
    })

    it('confirm button disabled uses hasCompleteLockedShipping', () => {
      const buttonIdx = source.indexOf('onClick={handleConfirm}')
      expect(buttonIdx, 'confirm button must exist').toBeGreaterThan(0)
      const buttonLine = source.substring(buttonIdx, source.indexOf('>', buttonIdx) + 1)
      const disabledMatch = buttonLine.match(/disabled=\{([^}]+)\}/)
      expect(disabledMatch, 'disabled attribute must exist').toBeDefined()
      expect(disabledMatch![1]).toMatch(/hasCompleteLockedShipping/)
    })
  })

  describe('P1: JSX rendering — blank lockedShipping shows red error, not yellow summary', () => {
    it('JSX yellow branch uses hasCompleteLockedShipping && lockedShipping (NOT just lockedShipping truthy)', () => {
      const jsxStart = source.indexOf('{hasPendingOrder ? (')
      expect(jsxStart, 'hasPendingOrder ternary must exist').toBeGreaterThan(0)
      const afterTernary = source.substring(jsxStart)
      expect(afterTernary).toMatch(/hasCompleteLockedShipping\s*&&\s*lockedShipping/)
    })

    it('when hasCompleteLockedShipping is false, shows red error (NOT yellow summary)', () => {
      const jsxStart = source.indexOf('{hasPendingOrder ? (')
      expect(jsxStart, 'hasPendingOrder ternary must exist').toBeGreaterThan(0)
      const afterTernary = source.substring(jsxStart)
      const redBranch = extractBlock(afterTernary, ') : (', '订单收货信息缺失')
      expect(redBranch).toContain('订单收货信息缺失')
    })

    it('when hasCompleteLockedShipping is true && lockedShipping exists, shows yellow summary', () => {
      const jsxStart = source.indexOf('{hasPendingOrder ? (')
      expect(jsxStart, 'hasPendingOrder ternary must exist').toBeGreaterThan(0)
      const afterTernary = source.substring(jsxStart)
      const yellowBranch = extractBlock(afterTernary, 'hasCompleteLockedShipping && lockedShipping ? (', ') : (')
      expect(yellowBranch).toContain('订单已创建')
    })

    it('blank-name lockedShipping (recipientName="   ") would make hasCompleteLockedShipping false', () => {
      const varSection = extractParenthesizedExpression(source, 'hasCompleteLockedShipping')
      expect(varSection).toMatch(/recipientName.*trim/)
    })

    it('blank-phone lockedShipping (recipientPhone="   ") would make hasCompleteLockedShipping false', () => {
      const varSection = extractParenthesizedExpression(source, 'hasCompleteLockedShipping')
      expect(varSection).toMatch(/recipientPhone.*trim/)
    })

    it('blank-address lockedShipping (shippingAddress="   ") would make hasCompleteLockedShipping false', () => {
      const varSection = extractParenthesizedExpression(source, 'hasCompleteLockedShipping')
      expect(varSection).toMatch(/shippingAddress.*trim/)
    })
  })

  describe('real JSX rendering with @vitejs/plugin-react', () => {
    let CheckoutDialog: React.ComponentType<any>

    beforeAll(async () => {

      const mod = await import('@/components/checkout/CheckoutDialog')
      CheckoutDialog = mod.CheckoutDialog
    })

    const baseProps = {
      open: true,
      product: { id: 'p1', name: '测试商品', memberPrice: 99.9 },
      onClose: () => {},
      onConfirm: async () => ({ orderId: 'o1' }),
      hasPendingOrder: true,
    }

    function render(props: Record<string, any>): string {
      const element = React.createElement(CheckoutDialog, { ...baseProps, ...props })
      return renderToStaticMarkup(element)
    }

    function getButtonByText(html: string, text: string): string {
      const buttons = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)]
        .map((match) => match[0])
      const matchingButtons = buttons.filter((button) => button.includes(text))

      expect(matchingButtons, `应唯一找到按钮：${text}`).toHaveLength(1)
      return matchingButtons[0]
    }

    it('smoke: imports CheckoutDialog as a function', () => {
      expect(CheckoutDialog).toBeDefined()
      expect(typeof CheckoutDialog).toBe('function')
    })

    it('pendingOrderShipping=null shows red error, no yellow summary, no address picker, button disabled', () => {
      const html = render({ pendingOrderShipping: null })

      expect(html).toContain('订单收货信息缺失，请联系客服')
      expect(html).not.toContain('订单已创建，收货信息以首次提交为准')
      expect(html).not.toContain('选择收货地址')

      const confirmButton = getButtonByText(html, '重新确认支付')
      expect(confirmButton).toMatch(/\sdisabled(?:=""|(?=\s|>))/)
    })

    it('pendingOrderShipping with blank recipientName="   " shows red error, no yellow summary, no address picker, button disabled', () => {
      const html = render({
        pendingOrderShipping: { recipientName: '   ', recipientPhone: '13800001111', shippingAddress: '北京市朝阳区' },
      })

      expect(html).toContain('订单收货信息缺失，请联系客服')
      expect(html).not.toContain('订单已创建，收货信息以首次提交为准')
      expect(html).not.toContain('选择收货地址')

      const confirmButton = getButtonByText(html, '重新确认支付')
      expect(confirmButton).toMatch(/\sdisabled(?:=""|(?=\s|>))/)
    })

    it('pendingOrderShipping with blank recipientPhone="   " shows red error, no yellow summary, no address picker, button disabled', () => {
      const html = render({
        pendingOrderShipping: { recipientName: '张三', recipientPhone: '   ', shippingAddress: '北京市朝阳区' },
      })

      expect(html).toContain('订单收货信息缺失，请联系客服')
      expect(html).not.toContain('订单已创建，收货信息以首次提交为准')
      expect(html).not.toContain('选择收货地址')

      const confirmButton = getButtonByText(html, '重新确认支付')
      expect(confirmButton).toMatch(/\sdisabled(?:=""|(?=\s|>))/)
    })

    it('pendingOrderShipping with blank shippingAddress="   " shows red error, no yellow summary, no address picker, button disabled', () => {
      const html = render({
        pendingOrderShipping: { recipientName: '张三', recipientPhone: '13800001111', shippingAddress: '   ' },
      })

      expect(html).toContain('订单收货信息缺失，请联系客服')
      expect(html).not.toContain('订单已创建，收货信息以首次提交为准')
      expect(html).not.toContain('选择收货地址')

      const confirmButton = getButtonByText(html, '重新确认支付')
      expect(confirmButton).toMatch(/\sdisabled(?:=""|(?=\s|>))/)
    })

    it('pendingOrderShipping with complete fields (with leading/trailing spaces) shows yellow summary, no red error, button NOT disabled', () => {
      const html = render({
        pendingOrderShipping: {
          recipientName: '  张三  ',
          recipientPhone: '  13800001111  ',
          shippingAddress: '  北京市朝阳区建国路1号  ',
        },
      })

      expect(html).toContain('订单已创建，收货信息以首次提交为准')
      expect(html).toContain('张三')
      expect(html).toContain('13800001111')
      expect(html).toContain('北京市朝阳区建国路1号')
      expect(html).not.toContain('订单收货信息缺失，请联系客服')

      const confirmButton = getButtonByText(html, '重新确认支付')
      expect(confirmButton).not.toMatch(/\sdisabled(?:=""|(?=\s|>))/)
    })
  })

})
