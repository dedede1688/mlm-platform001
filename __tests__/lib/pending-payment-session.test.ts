import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const sessionStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
    get _store() { return store },
    set _store(v: Record<string, string>) { store = v },
  }
})()

Object.defineProperty(globalThis, 'sessionStorage', { value: sessionStorageMock, writable: true })

import {
  getProductPendingPaymentKey,
  loadProductPendingPayment,
  saveProductPendingPayment,
  clearProductPendingPayment,
  calculatePendingShortage,
  type ProductPendingPaymentSession,
} from '@/lib/utils/pending-payment-session'

describe('pending-payment-session', () => {
  beforeEach(() => {
    sessionStorageMock._store = {}
    sessionStorageMock.getItem.mockClear()
    sessionStorageMock.setItem.mockClear()
    sessionStorageMock.removeItem.mockClear()
    sessionStorageMock.clear.mockClear()
  })

  describe('getProductPendingPaymentKey', () => {
    it('returns different keys for different users', () => {
      expect(getProductPendingPaymentKey('u1', 'p1'))
        .not.toBe(getProductPendingPaymentKey('u2', 'p1'))
    })

    it('returns different keys for different products', () => {
      expect(getProductPendingPaymentKey('u1', 'p1'))
        .not.toBe(getProductPendingPaymentKey('u1', 'p2'))
    })
  })

  describe('saveProductPendingPayment', () => {
    it('saves valid session and returns ok', () => {
      const result = saveProductPendingPayment({
        version: 1,
        userId: 'u1',
        productId: 'p1',
        orderId: 'o1',
        shortage: 300,
      })
      expect(result).toEqual({ ok: true })
    })

    it('rejects empty userId', () => {
      const result = saveProductPendingPayment({
        version: 1,
        userId: '',
        productId: 'p1',
        orderId: 'o1',
        shortage: 300,
      } as ProductPendingPaymentSession)
      expect(result.ok).toBe(false)
    })

    it('rejects empty productId', () => {
      const result = saveProductPendingPayment({
        version: 1,
        userId: 'u1',
        productId: '',
        orderId: 'o1',
        shortage: 300,
      } as ProductPendingPaymentSession)
      expect(result.ok).toBe(false)
    })

    it('rejects empty orderId', () => {
      const result = saveProductPendingPayment({
        version: 1,
        userId: 'u1',
        productId: 'p1',
        orderId: '',
        shortage: 300,
      } as ProductPendingPaymentSession)
      expect(result.ok).toBe(false)
    })

    it('rejects negative shortage', () => {
      const result = saveProductPendingPayment({
        version: 1,
        userId: 'u1',
        productId: 'p1',
        orderId: 'o1',
        shortage: -10,
      })
      expect(result.ok).toBe(false)
    })

    it('rejects NaN shortage', () => {
      const result = saveProductPendingPayment({
        version: 1,
        userId: 'u1',
        productId: 'p1',
        orderId: 'o1',
        shortage: NaN,
      } as any)
      expect(result.ok).toBe(false)
    })

    it('rejects Infinity shortage', () => {
      const result = saveProductPendingPayment({
        version: 1,
        userId: 'u1',
        productId: 'p1',
        orderId: 'o1',
        shortage: Infinity,
      } as any)
      expect(result.ok).toBe(false)
    })

    it('returns failure when sessionStorage throws', () => {
      sessionStorageMock.setItem.mockImplementationOnce(() => { throw new Error('QuotaExceededError') })
      const result = saveProductPendingPayment({
        version: 1,
        userId: 'u1',
        productId: 'p1',
        orderId: 'o1',
        shortage: 0,
      })
      expect(result.ok).toBe(false)
    })
  })

  describe('loadProductPendingPayment', () => {
    it('returns empty when no data exists', () => {
      const result = loadProductPendingPayment('u1', 'p1')
      expect(result).toEqual({ status: 'empty' })
    })

    it('loads valid saved session', () => {
      saveProductPendingPayment({
        version: 1,
        userId: 'u1',
        productId: 'p1',
        orderId: 'o1',
        shortage: 300,
      })
      const result = loadProductPendingPayment('u1', 'p1')
      expect(result.status).toBe('valid')
      if (result.status === 'valid') {
        expect(result.value.orderId).toBe('o1')
        expect(result.value.shortage).toBe(300)
      }
    })

    it('returns invalid for corrupted JSON', () => {
      const key = getProductPendingPaymentKey('u1', 'p1')
      sessionStorageMock._store[key] = '{not valid json'
      const result = loadProductPendingPayment('u1', 'p1')
      expect(result.status).toBe('invalid')
    })

    it('returns invalid for wrong version', () => {
      const key = getProductPendingPaymentKey('u1', 'p1')
      sessionStorageMock._store[key] = JSON.stringify({
        version: 2,
        userId: 'u1',
        productId: 'p1',
        orderId: 'o1',
        shortage: 100,
      })
      const result = loadProductPendingPayment('u1', 'p1')
      expect(result.status).toBe('invalid')
    })

    it('returns empty for user mismatch (different key)', () => {
      saveProductPendingPayment({
        version: 1,
        userId: 'u1',
        productId: 'p1',
        orderId: 'o1',
        shortage: 100,
      })
      const result = loadProductPendingPayment('u2', 'p1')
      expect(result.status).toBe('empty')
    })

    it('returns empty for product mismatch (different key)', () => {
      saveProductPendingPayment({
        version: 1,
        userId: 'u1',
        productId: 'p1',
        orderId: 'o1',
        shortage: 100,
      })
      const result = loadProductPendingPayment('u1', 'p2')
      expect(result.status).toBe('empty')
    })

    it('returns invalid when stored data has wrong userId', () => {
      const key = getProductPendingPaymentKey('u1', 'p1')
      sessionStorageMock._store[key] = JSON.stringify({
        version: 1,
        userId: 'u2',
        productId: 'p1',
        orderId: 'o1',
        shortage: 100,
      })
      const result = loadProductPendingPayment('u1', 'p1')
      expect(result.status).toBe('invalid')
    })

    it('returns invalid when stored data has wrong productId', () => {
      const key = getProductPendingPaymentKey('u1', 'p1')
      sessionStorageMock._store[key] = JSON.stringify({
        version: 1,
        userId: 'u1',
        productId: 'p2',
        orderId: 'o1',
        shortage: 100,
      })
      const result = loadProductPendingPayment('u1', 'p1')
      expect(result.status).toBe('invalid')
    })

    it('returns unavailable when sessionStorage throws on read', () => {
      sessionStorageMock.getItem.mockImplementationOnce(() => { throw new Error('SecurityError') })
      const result = loadProductPendingPayment('u1', 'p1')
      expect(result.status).toBe('unavailable')
    })

    it('clears corrupted data on invalid', () => {
      const key = getProductPendingPaymentKey('u1', 'p1')
      sessionStorageMock._store[key] = '{bad'
      loadProductPendingPayment('u1', 'p1')
      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith(key)
    })
  })

  describe('clearProductPendingPayment', () => {
    it('removes the session key', () => {
      saveProductPendingPayment({
        version: 1,
        userId: 'u1',
        productId: 'p1',
        orderId: 'o1',
        shortage: 0,
      })
      const result = clearProductPendingPayment('u1', 'p1')
      expect(result).toBe(true)
      expect(loadProductPendingPayment('u1', 'p1').status).toBe('empty')
    })

    it('returns false when sessionStorage throws', () => {
      sessionStorageMock.removeItem.mockImplementationOnce(() => { throw new Error('fail') })
      expect(clearProductPendingPayment('u1', 'p1')).toBe(false)
    })
  })

  describe('calculatePendingShortage', () => {
    it('returns positive shortage when balance < payAmount', () => {
      expect(calculatePendingShortage(500, 200)).toBe(300)
    })

    it('returns 0 when balance >= payAmount', () => {
      expect(calculatePendingShortage(500, 800)).toBe(0)
    })

    it('returns 0 when balance equals payAmount', () => {
      expect(calculatePendingShortage(500, 500)).toBe(0)
    })

    it('handles zero balance', () => {
      expect(calculatePendingShortage(500, 0)).toBe(500)
    })

    it('returns null when payAmount is NaN (P1-2)', () => {
      expect(calculatePendingShortage(NaN, 200)).toBeNull()
    })

    it('returns null when balance is NaN (P1-2)', () => {
      expect(calculatePendingShortage(500, NaN)).toBeNull()
    })

    it('returns null when payAmount is Infinity (P1-2)', () => {
      expect(calculatePendingShortage(Infinity, 200)).toBeNull()
    })

    it('returns null when balance is Infinity (P1-2)', () => {
      expect(calculatePendingShortage(500, Infinity)).toBeNull()
    })

    it('returns null when payAmount is -Infinity (P1-2)', () => {
      expect(calculatePendingShortage(-Infinity, 200)).toBeNull()
    })

    it('returns null when payAmount is negative (P1-2)', () => {
      expect(calculatePendingShortage(-100, 200)).toBeNull()
    })

    it('returns null when balance is negative (P1-2)', () => {
      expect(calculatePendingShortage(500, -100)).toBeNull()
    })

    it('returns null when both are NaN (P1-2)', () => {
      expect(calculatePendingShortage(NaN, NaN)).toBeNull()
    })

    it('returns 0 when both are 0 (P1-2)', () => {
      expect(calculatePendingShortage(0, 0)).toBe(0)
    })

    it('returns payAmount when balance is 0 (P1-2)', () => {
      expect(calculatePendingShortage(300, 0)).toBe(300)
    })
  })
})