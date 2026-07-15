import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const pagePath = resolve(__dirname, '../../src/app/products/[id]/page.tsx')
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

function extractBracedBlock(src: string, marker: string): string {
  const markerIndex = src.indexOf(marker)
  if (markerIndex === -1) {
    throw new Error(`extractBracedBlock: marker "${marker}" not found`)
  }
  const arrowIndex = src.indexOf('=>', markerIndex)
  if (arrowIndex === -1 || arrowIndex < markerIndex) {
    throw new Error(`extractBracedBlock: arrow => not found after marker "${marker}"`)
  }
  const openIndex = src.indexOf('{', arrowIndex)
  if (openIndex === -1 || openIndex < arrowIndex) {
    throw new Error(`extractBracedBlock: opening brace not found after arrow for marker "${marker}"`)
  }
  let depth = 0
  for (let index = openIndex; index < src.length; index += 1) {
    if (src[index] === '{') depth += 1
    if (src[index] === '}') depth -= 1
    if (depth === 0) return src.slice(markerIndex, index + 1)
  }
  throw new Error(`extractBracedBlock: unbalanced braces for marker "${marker}"`)
}

describe('Product detail page - pending payment flow contract', () => {
  beforeAll(() => {
    source = readFileSync(pagePath, 'utf-8')
  })

  it('imports pending-payment-session utilities', () => {
    const importLine = source.split('\n').find(l => l.includes("pending-payment-session"))
    expect(importLine).toBeDefined()
    const importBlock = source.substring(source.indexOf('{'), source.indexOf("} from '@/lib/utils/pending-payment-session'") + 1)
    expect(importBlock).toContain('loadProductPendingPayment')
    expect(importBlock).toContain('saveProductPendingPayment')
    expect(importBlock).toContain('clearProductPendingPayment')
    expect(importBlock).toContain('calculatePendingShortage')
  })

  it('imports CheckoutLockedShipping type', () => {
    expect(source).toMatch(/import.*CheckoutLockedShipping.*from/)
  })

  it('defines ProductPageUser with id and earningsAvailable', () => {
    const userBlock = extractBlock(source, 'interface ProductPageUser', '}')
    expect(userBlock).toContain('id: string')
    expect(userBlock).toContain('earningsAvailable: number')
  })

  it('has pendingPayment, restoreStatus, restoreError and earnings modal state', () => {
    const stateDeclarations = source.split('\n').filter(l =>
      l.includes('useState') && (
        l.includes('pendingPayment') || l.includes('restoreStatus') ||
        l.includes('restoreError') || l.includes('showEarningsTransfer')
      )
    )
    expect(stateDeclarations.length).toBeGreaterThanOrEqual(4)
  })

  it('has lastRestoreKeyRef for dedup', () => {
    expect(source).toContain('lastRestoreKeyRef')
    expect(source).toMatch(/useRef/)
  })

  it('handleCheckoutConfirm skips order creation when pendingPayment exists', () => {
    const confirmBlock = extractBlock(source, 'const handleCheckoutConfirm', 'setBuying(false)')
    expect(confirmBlock).toMatch(/pendingPayment\??\.\s*orderId\s*\?\?\s*null/)
  })

  it('saves orderId and payAmount after new order creation', () => {
    const confirmBlock = extractBlock(source, 'const handleCheckoutConfirm', 'setBuying(false)')
    expect(confirmBlock).toContain('currentPayAmount')
  })

  it('recognizes INSUFFICIENT_BALANCE error code', () => {
    const confirmBlock = extractBlock(source, 'const handleCheckoutConfirm', 'setBuying(false)')
    expect(confirmBlock).toContain('INSUFFICIENT_BALANCE')
  })

  it('uses calculatePendingShortage for shortage calculation', () => {
    const confirmBlock = extractBlock(source, 'const handleCheckoutConfirm', 'setBuying(false)')
    expect(confirmBlock).toContain('calculatePendingShortage')
  })

  it('persists pending payment session on insufficient balance', () => {
    const confirmBlock = extractBlock(source, 'const handleCheckoutConfirm', 'setBuying(false)')
    expect(confirmBlock).toContain('persistPendingPayment')
  })

  it('opens earnings transfer modal when earningsAvailable > 0', () => {
    const confirmBlock = extractBlock(source, 'const handleCheckoutConfirm', 'setBuying(false)')
    expect(confirmBlock).toMatch(/earningsAvailable\s*>\s*0/)
    expect(confirmBlock).toContain('setShowEarningsTransfer')
  })

  it('handleEarningsTransferSuccess does not call verify-payment', () => {
    const successBlock = extractBlock(source, 'const handleEarningsTransferSuccess', 'setShowEarningsTransfer(false)')
    expect(successBlock).not.toContain('verify-payment')
    expect(successBlock).not.toContain('handleCheckoutConfirm')
  })

  it('refreshes user after earnings transfer and recalculates shortage', () => {
    const successBlock = extractBlock(source, 'const handleEarningsTransferSuccess', 'toast.success')
    expect(successBlock).toContain('fetchUser')
    expect(successBlock).toContain('calculatePendingShortage')
  })

  it('checks session save before navigating to recharge', () => {
    const rechargeBlock = extractBlock(source, 'const handleGoRecharge', 'router.push')
    expect(rechargeBlock).toContain('saveProductPendingPayment')
  })

  it('restorePendingPayment uses Bearer token and validates pending status', () => {
    const restoreBlock = extractBlock(source, 'const restorePendingPayment = async', '} catch')
    expect(restoreBlock).toContain('Authorization')
    expect(restoreBlock).toContain("'pending'")
  })

  it('clears session on 404, 403 and invalid order', () => {
    const restoreBlock = extractBlock(source, 'const restorePendingPayment = async', '} catch')
    const clearCount = (restoreBlock.match(/clearProductPendingPayment/g) || []).length
    expect(clearCount).toBeGreaterThanOrEqual(3)
  })

  it('enters validation_error on 500 or network error without clearing session', () => {
    const restoreBlock = extractBlock(source, 'const restorePendingPayment = async', '} catch')
    expect(restoreBlock).toContain('validation_error')
  })

  it('blocks order creation when validating or validation_error', () => {
    const buyBlock = extractBlock(source, 'const handleBuyNow', 'setCheckoutOpen(true)')
    expect(buyBlock).toMatch(/validating/)
    expect(buyBlock).toMatch(/validation_error/)
  })

  it('provides re-validate button calling restorePendingPayment(true)', () => {
    const btnIdx = source.indexOf('restorePendingPayment(true)')
    expect(btnIdx).toBeGreaterThan(0)
    const btnContext = extractBlock(source, 'restoreError ||', '</button>')
    expect(btnContext).toContain('restorePendingPayment(true)')
    expect(btnContext).toContain('重新验证')
  })

  it('clears session on payment success', () => {
    const confirmBlock = extractBlock(source, 'const handleCheckoutConfirm', 'setBuying(false)')
    expect(confirmBlock).toContain('clearProductPendingPayment')
  })

  it('passes hasPendingOrder, shortage, earningsAvailable, pendingOrderShipping to CheckoutDialog', () => {
    const dialogBlock = extractBlock(source, '<CheckoutDialog', '/>')
    expect(dialogBlock).toContain('hasPendingOrder')
    expect(dialogBlock).toContain('shortage')
    expect(dialogBlock).toContain('earningsAvailable')
    expect(dialogBlock).toContain('pendingOrderShipping')
  })

  it('EarningsTransferModal initialAmount is min of shortage and earningsAvailable', () => {
    const modalBlock = extractBlock(source, '<EarningsTransferModal', '/>')
    expect(modalBlock).toMatch(/Math\.min/)
  })

  it('shows restored pending order message', () => {
    const msgBlock = extractBlock(source, "restoreStatus === 'restored'", '</div>')
    expect(msgBlock).toContain('已恢复待支付订单')
  })

  describe('P0-2: restorePendingPayment must NOT use ?? 0 on calculatePendingShortage', () => {
    it('restorePendingPayment does NOT contain calculatePendingShortage(...) ?? 0', () => {
      const restoreBlock = extractBlock(source, 'const restorePendingPayment = async', '} catch')
      expect(restoreBlock).not.toMatch(/calculatePendingShortage\s*\([^)]*\)\s*\?\?\s*0/)
    })

    it('when calculatePendingShortage returns null in restorePendingPayment, enters validation_error', () => {
      const restoreBlock = extractBlock(source, 'const restorePendingPayment = async', '} catch')
      const shortageSection = restoreBlock.substring(
        restoreBlock.indexOf('calculatePendingShortage'),
        restoreBlock.length
      )
      expect(shortageSection).toMatch(/validation_error/)
    })

    it('when calculatePendingShortage returns null in restorePendingPayment, does NOT call persistPendingPayment', () => {
      const restoreBlock = extractBlock(source, 'const restorePendingPayment = async', '} catch')
      const shortageIdx = restoreBlock.indexOf('calculatePendingShortage')
      expect(shortageIdx, 'calculatePendingShortage must exist in restoreBlock').toBeGreaterThanOrEqual(0)
      const afterShortage = restoreBlock.substring(shortageIdx)
      const nullBranchIdx = afterShortage.indexOf('null')
      expect(nullBranchIdx, 'null branch must exist after calculatePendingShortage').toBeGreaterThanOrEqual(0)
      const nullSection = extractBlock(afterShortage, afterShortage.substring(nullBranchIdx, nullBranchIdx + 5), 'return')
      expect(nullSection).not.toContain('persistPendingPayment')
    })

    it('when calculatePendingShortage returns null in restorePendingPayment, does NOT set restoreStatus to restored', () => {
      const restoreBlock = extractBlock(source, 'const restorePendingPayment = async', '} catch')
      const shortageIdx = restoreBlock.indexOf('calculatePendingShortage')
      expect(shortageIdx, 'calculatePendingShortage must exist in restoreBlock').toBeGreaterThanOrEqual(0)
      const afterShortage = restoreBlock.substring(shortageIdx)
      const nullBranchIdx = afterShortage.indexOf('null')
      expect(nullBranchIdx, 'null branch must exist after calculatePendingShortage').toBeGreaterThanOrEqual(0)
      const nullSection = extractBlock(afterShortage, afterShortage.substring(nullBranchIdx, nullBranchIdx + 5), 'return')
      expect(nullSection).not.toContain("'restored'")
    })
  })

  describe('P0-2: handleCheckoutConfirm shortage branch must NOT use ?? 0', () => {
    it('handleCheckoutConfirm does NOT contain calculatePendingShortage(...) ?? 0', () => {
      const confirmBlock = extractBlock(source, 'const handleCheckoutConfirm', 'setBuying(false)')
      expect(confirmBlock).not.toMatch(/calculatePendingShortage\s*\([^)]*\)\s*\?\?\s*0/)
    })

    it('rawApiShortage negative number must NOT become 0 via Math.max(0, rawApiShortage)', () => {
      const confirmBlock = extractBlock(source, 'const handleCheckoutConfirm', 'setBuying(false)')
      const shortageLine = confirmBlock.split('\n').find(l => l.includes('rawApiShortage'))
      expect(shortageLine).toBeDefined()
      expect(shortageLine!).not.toMatch(/Math\.max\s*\(\s*0\s*,\s*rawApiShortage\s*\)/)
    })

    it('when calculatePendingShortage returns null in handleCheckoutConfirm, does NOT update pendingPayment.shortage', () => {
      const confirmBlock = extractBlock(source, 'const handleCheckoutConfirm', 'setBuying(false)')
      const shortageIdx = confirmBlock.indexOf('calculatePendingShortage')
      expect(shortageIdx, 'calculatePendingShortage must exist in confirmBlock').toBeGreaterThanOrEqual(0)
      const afterShortage = confirmBlock.substring(shortageIdx)
      expect(afterShortage).toContain('null')
      expect(afterShortage).toContain('validation_error')
    })

    it('when calculatePendingShortage returns null in handleCheckoutConfirm, does NOT open earnings transfer modal', () => {
      const confirmBlock = extractBlock(source, 'const handleCheckoutConfirm', 'setBuying(false)')
      const shortageIdx = confirmBlock.indexOf('calculatePendingShortage')
      expect(shortageIdx, 'calculatePendingShortage must exist in confirmBlock').toBeGreaterThanOrEqual(0)
      const afterShortage = confirmBlock.substring(shortageIdx)
      const nullBranchIdx = afterShortage.indexOf('null')
      expect(nullBranchIdx, 'null branch must exist after calculatePendingShortage').toBeGreaterThanOrEqual(0)
      const nullSection = extractBlock(afterShortage, afterShortage.substring(nullBranchIdx, nullBranchIdx + 5), 'return')
      expect(nullSection).not.toContain('setShowEarningsTransfer')
    })

    it('when calculatePendingShortage returns null in handleCheckoutConfirm, does NOT persist shortage=0', () => {
      const confirmBlock = extractBlock(source, 'const handleCheckoutConfirm', 'setBuying(false)')
      const shortageIdx = confirmBlock.indexOf('calculatePendingShortage')
      expect(shortageIdx, 'calculatePendingShortage must exist in confirmBlock').toBeGreaterThanOrEqual(0)
      const afterShortage = confirmBlock.substring(shortageIdx)
      const nullBranchIdx = afterShortage.indexOf('null')
      expect(nullBranchIdx, 'null branch must exist after calculatePendingShortage').toBeGreaterThanOrEqual(0)
      const nullSection = extractBlock(afterShortage, afterShortage.substring(nullBranchIdx, nullBranchIdx + 5), 'return')
      expect(nullSection).not.toMatch(/persistPendingPayment\([^)]*,\s*0\s*\)/)
    })
  })

  describe('P0-2: handleEarningsTransferSuccess must NOT use ?? 0', () => {
    it('handleEarningsTransferSuccess does NOT contain calculatePendingShortage(...) ?? 0', () => {
      const successBlock = extractBlock(source, 'const handleEarningsTransferSuccess', 'toast.success')
      expect(successBlock).not.toMatch(/calculatePendingShortage\s*\([^)]*\)\s*\?\?\s*0/)
    })

    it('when fetchUser returns null, does NOT guess shortage with pendingPayment.shortage - transferAmount', () => {
      const successBlock = extractBlock(source, 'const handleEarningsTransferSuccess', 'toast.success')
      expect(successBlock).not.toMatch(/pendingPayment\.shortage\s*-\s*transferAmount/)
    })

    it('when fetchUser returns null, enters validation_error', () => {
      const successBlock = extractBlock(source, 'const handleEarningsTransferSuccess', 'toast.success')
      const latestUserIdx = successBlock.indexOf('latestUser')
      expect(latestUserIdx, 'latestUser must exist in successBlock').toBeGreaterThanOrEqual(0)
      const afterLatestUser = successBlock.substring(latestUserIdx)
      const nullBranchIdx = afterLatestUser.indexOf('null')
      expect(nullBranchIdx, 'null branch must exist after latestUser').toBeGreaterThanOrEqual(0)
      const nullSection = extractBlock(afterLatestUser, afterLatestUser.substring(nullBranchIdx, nullBranchIdx + 5), 'return')
      expect(nullSection).toContain('validation_error')
    })

    it('when calculatePendingShortage returns null, does NOT update or persist shortage', () => {
      const successBlock = extractBlock(source, 'const handleEarningsTransferSuccess', 'toast.success')
      const shortageIdx = successBlock.indexOf('calculatePendingShortage')
      expect(shortageIdx, 'calculatePendingShortage must exist in successBlock').toBeGreaterThanOrEqual(0)
      const afterShortage = successBlock.substring(shortageIdx)
      const nullBranchIdx = afterShortage.indexOf('null')
      expect(nullBranchIdx, 'null branch must exist after calculatePendingShortage').toBeGreaterThanOrEqual(0)
      const nullSection = extractBlock(afterShortage, afterShortage.substring(nullBranchIdx, nullBranchIdx + 5), 'return')
      expect(nullSection).not.toContain('persistPendingPayment')
      expect(nullSection).not.toMatch(/setPendingPayment/)
    })

    it('does NOT call verify-payment or handleCheckoutConfirm after earnings transfer', () => {
      const successBlock = extractBlock(source, 'const handleEarningsTransferSuccess', 'toast.success')
      expect(successBlock).not.toContain('verify-payment')
      expect(successBlock).not.toContain('handleCheckoutConfirm')
    })

    it('preserves original orderId on all error branches', () => {
      const successBlock = extractBlock(source, 'const handleEarningsTransferSuccess', 'toast.success')
      expect(successBlock).toContain('pendingPayment')
      const orderIdReassignments = [...successBlock.matchAll(/orderId\s*=\s*([^;\n]+)/g)]
      for (const assignment of orderIdReassignments) {
        const rightHandSide = assignment[1].trim()
        expect(rightHandSide, 'orderId assignment must come from pendingPayment, not overwritten').toMatch(/^pendingPayment/)
      }
      const nextSpreads = [...successBlock.matchAll(/\.\.\.\s*pendingPayment/g)]
      expect(nextSpreads.length, 'must spread pendingPayment to preserve orderId').toBeGreaterThan(0)
    })
  })

  describe('P0-A: API shortage must be checked with typeof === "number" before use', () => {
    it('does NOT use Number() to coerce verifyErr.data?.shortage', () => {
      const confirmBlock = extractBlock(source, 'const handleCheckoutConfirm', 'setBuying(false)')
      expect(confirmBlock).not.toMatch(/Number\s*\(\s*verifyErr\.data\?\.\s*shortage\s*\)/)
    })

    it('uses typeof rawApiShortage === "number" guard before isFinite check', () => {
      const confirmBlock = extractBlock(source, 'const handleCheckoutConfirm', 'setBuying(false)')
      expect(confirmBlock).toMatch(/typeof\s+rawApiShortage\s*===\s*['"]number['"]/)
    })

    it('rawApiShortage variable is assigned from verifyErr.data?.shortage directly (no Number wrapper)', () => {
      const confirmBlock = extractBlock(source, 'const handleCheckoutConfirm', 'setBuying(false)')
      expect(confirmBlock).toMatch(/rawApiShortage\s*=\s*verifyErr\.data\?\.\s*shortage/)
    })

    it('typeof check comes before Number.isFinite in the guard condition', () => {
      const confirmBlock = extractBlock(source, 'const handleCheckoutConfirm', 'setBuying(false)')
      const typeofIdx = confirmBlock.indexOf('typeof rawApiShortage')
      const isFiniteIdx = confirmBlock.indexOf('Number.isFinite(rawApiShortage)')
      expect(typeofIdx, 'typeof rawApiShortage must exist in confirmBlock').toBeGreaterThan(0)
      expect(isFiniteIdx, 'Number.isFinite(rawApiShortage) must exist in confirmBlock').toBeGreaterThan(0)
      expect(typeofIdx, 'typeof check must appear BEFORE isFinite check').toBeLessThan(isFiniteIdx)
    })

    it('when typeof check fails, falls through to calculatePendingShortage fallback', () => {
      const confirmBlock = extractBlock(source, 'const handleCheckoutConfirm', 'setBuying(false)')
      const typeofIdx = confirmBlock.indexOf('typeof rawApiShortage')
      expect(typeofIdx, 'typeof rawApiShortage must exist').toBeGreaterThan(0)
      const afterTypeof = confirmBlock.substring(typeofIdx)
      const elseIdx = afterTypeof.indexOf('else')
      expect(elseIdx, 'must have else branch after typeof check').toBeGreaterThan(0)
      const elseBlock = afterTypeof.substring(elseIdx)
      expect(elseBlock).toContain('calculatePendingShortage')
    })
  })

  describe('P0-B: new order creation must NOT hard-code shortage: 0', () => {
    it('does NOT set shortage: 0 in currentPendingPayment after order creation', () => {
      const confirmBlock = extractBlock(source, 'const handleCheckoutConfirm', 'setBuying(false)')
      expect(confirmBlock).not.toMatch(/shortage:\s*0/)
    })

    it('does NOT call persistPendingPayment(orderId, 0) after order creation', () => {
      const confirmBlock = extractBlock(source, 'const handleCheckoutConfirm', 'setBuying(false)')
      expect(confirmBlock).not.toMatch(/persistPendingPayment\s*\(\s*orderId\s*,\s*0\s*\)/)
    })

    it('uses calculatePendingShortage to compute initial shortage after order creation', () => {
      const confirmBlock = extractBlock(source, 'const handleCheckoutConfirm', 'setBuying(false)')
      const orderCreationIdx = confirmBlock.indexOf('currentPayAmount')
      expect(orderCreationIdx, 'must have currentPayAmount').toBeGreaterThan(0)
      const afterCreation = confirmBlock.substring(orderCreationIdx)
      const shortageAssignmentIdx = afterCreation.indexOf('shortage:')
      expect(shortageAssignmentIdx, 'must have shortage assignment').toBeGreaterThan(0)
      const beforeShortage = afterCreation.substring(0, shortageAssignmentIdx)
      const afterShortage = afterCreation.substring(shortageAssignmentIdx)
      expect(afterShortage).toMatch(/calculatePendingShortage/)
    })

    it('when calculatePendingShortage returns null after order creation, enters validation_error and does NOT proceed to verify-payment', () => {
      const confirmBlock = extractBracedBlock(source, 'const handleCheckoutConfirm')
      const creationIdx = confirmBlock.indexOf('shortage:')
      expect(creationIdx, 'shortage assignment must exist').toBeGreaterThanOrEqual(0)
      const beforeCreation = confirmBlock.substring(0, creationIdx)
      expect(beforeCreation).toContain('null')
      expect(beforeCreation).toContain('validation_error')
    })
  })

  describe('P0: pre-create order balance validation (方案 A)', () => {
    it('handleCheckoutConfirm calls calculatePendingShortage BEFORE fetch(/api/orders)', () => {
      const confirmBlock = extractBracedBlock(source, 'const handleCheckoutConfirm')
      const precheckIndex = confirmBlock.indexOf('calculatePendingShortage(finalPrice, user.balance)')
      const createOrderIndex = confirmBlock.indexOf("fetch('/api/orders'")
      expect(precheckIndex, 'calculatePendingShortage(finalPrice, user.balance) must exist before fetch').toBeGreaterThanOrEqual(0)
      expect(createOrderIndex, "fetch('/api/orders') must exist").toBeGreaterThan(0)
      expect(createOrderIndex, 'create order fetch must come AFTER pre-check').toBeGreaterThan(precheckIndex)
    })

    it('pre-check null branch sets restoreStatus to validation_error', () => {
      const confirmBlock = extractBracedBlock(source, 'const handleCheckoutConfirm')
      const precheckIndex = confirmBlock.indexOf('calculatePendingShortage(finalPrice, user.balance)')
      expect(precheckIndex, 'pre-check must exist').toBeGreaterThanOrEqual(0)
      const afterPrecheck = confirmBlock.substring(precheckIndex)
      const nullIdx = afterPrecheck.indexOf('null')
      expect(nullIdx, 'null branch must exist after pre-check').toBeGreaterThanOrEqual(0)
      const nullSection = extractBlock(afterPrecheck, afterPrecheck.substring(nullIdx, nullIdx + 5), 'return')
      expect(nullSection).toContain('validation_error')
    })

    it('pre-check null branch shows "资金数据异常，无法创建订单" message', () => {
      const confirmBlock = extractBracedBlock(source, 'const handleCheckoutConfirm')
      const precheckIndex = confirmBlock.indexOf('calculatePendingShortage(finalPrice, user.balance)')
      expect(precheckIndex, 'pre-check must exist').toBeGreaterThanOrEqual(0)
      const afterPrecheck = confirmBlock.substring(precheckIndex)
      const nullIdx = afterPrecheck.indexOf('null')
      expect(nullIdx, 'null branch must exist after pre-check').toBeGreaterThanOrEqual(0)
      const nullSection = extractBlock(afterPrecheck, afterPrecheck.substring(nullIdx, nullIdx + 5), 'return')
      expect(nullSection).toContain('无法创建订单')
    })

    it('pre-check null branch returns BEFORE fetch(/api/orders) — no order created', () => {
      const confirmBlock = extractBracedBlock(source, 'const handleCheckoutConfirm')
      const precheckIndex = confirmBlock.indexOf('calculatePendingShortage(finalPrice, user.balance)')
      const createOrderIndex = confirmBlock.indexOf("fetch('/api/orders'")
      expect(precheckIndex, 'pre-check must exist').toBeGreaterThanOrEqual(0)
      const afterPrecheck = confirmBlock.substring(precheckIndex)
      const nullIdx = afterPrecheck.indexOf('null')
      expect(nullIdx, 'null branch must exist after pre-check').toBeGreaterThanOrEqual(0)
      const returnIdx = afterPrecheck.indexOf('return', nullIdx)
      expect(returnIdx, 'return must exist in null branch').toBeGreaterThan(nullIdx)
      const fetchFromPrecheck = afterPrecheck.indexOf("fetch('/api/orders'", nullIdx)
      if (fetchFromPrecheck !== -1) {
        expect(returnIdx, 'return must come before fetch in null branch').toBeLessThan(fetchFromPrecheck)
      }
    })

    it('new order branch does NOT contain persistPendingPayment(orderId, 0)', () => {
      const confirmBlock = extractBracedBlock(source, 'const handleCheckoutConfirm')
      expect(confirmBlock).not.toMatch(/persistPendingPayment\s*\(\s*orderId\s*,\s*0\s*\)/)
    })

    it('new order branch does NOT contain shortage: 0', () => {
      const confirmBlock = extractBracedBlock(source, 'const handleCheckoutConfirm')
      expect(confirmBlock).not.toMatch(/shortage:\s*0/)
    })

    it('after orderId is assigned a valid value, orderId is always preserved — no return null that discards a valid orderId', () => {
      const confirmBlock = extractBracedBlock(source, 'const handleCheckoutConfirm')
      const orderIdAssignIdx = confirmBlock.indexOf('orderId = String(')
      expect(orderIdAssignIdx, 'orderId = String( must exist').toBeGreaterThanOrEqual(0)
      const afterOrderIdAssign = confirmBlock.substring(orderIdAssignIdx)
      const ifNotOrderIdEnd = afterOrderIdAssign.indexOf('}', afterOrderIdAssign.indexOf('if (!orderId)'))
      expect(ifNotOrderIdEnd, 'if (!orderId) block must exist and close').toBeGreaterThan(0)
      const afterIfNotOrderId = afterOrderIdAssign.substring(ifNotOrderIdEnd + 1)
      const setPendingIdx = afterIfNotOrderId.indexOf('setPendingPayment(currentPendingPayment)')
      expect(setPendingIdx, 'setPendingPayment must exist after if (!orderId) block').toBeGreaterThan(0)
      const betweenSection = afterIfNotOrderId.substring(0, setPendingIdx)
      const returnNullMatches = betweenSection.match(/return\s+null/g)
      expect(returnNullMatches, 'no return null between if (!orderId) block and setPendingPayment — valid orderId must not be discarded').toBeNull()
    })
  })
})
