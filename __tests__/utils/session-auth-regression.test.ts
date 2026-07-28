import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getProductPurchaseAuthDecision,
  getProductUserResponseOutcome,
} from '@/app/products/[id]/product-auth-state'
import { getAuthUserRole } from '@/lib/utils/auth-token'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('session-backed admin role', () => {
  it('reads the current role from session storage', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn((key: string) => (
        key === 'user' ? JSON.stringify({ role: 'super_admin' }) : null
      )),
    })

    expect(getAuthUserRole()).toBe('super_admin')
  })

  it('returns an empty role for invalid or missing session data', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => '{invalid-json'),
    })

    expect(getAuthUserRole()).toBe('')
  })
})

describe('product purchase authentication', () => {
  it('waits for the user profile instead of redirecting an authenticated user', () => {
    expect(getProductPurchaseAuthDecision({
      hasToken: true,
      userReady: false,
      userLoadStatus: 'loading',
    })).toBe('wait')
  })

  it('allows purchase only when both token and user profile are ready', () => {
    expect(getProductPurchaseAuthDecision({
      hasToken: true,
      userReady: true,
      userLoadStatus: 'ready',
    })).toBe('allow')
  })

  it('redirects only when no token remains', () => {
    expect(getProductPurchaseAuthDecision({
      hasToken: false,
      userReady: false,
      userLoadStatus: 'anonymous',
    })).toBe('redirect-login')
    expect(getProductPurchaseAuthDecision({
      hasToken: true,
      userReady: false,
      userLoadStatus: 'error',
    })).toBe('retryable-error')
  })

  it('treats only an explicit 401 response as unauthorized', () => {
    expect(getProductUserResponseOutcome(200)).toBe('authenticated')
    expect(getProductUserResponseOutcome(401)).toBe('unauthorized')
    expect(getProductUserResponseOutcome(403)).toBe('retryable-error')
    expect(getProductUserResponseOutcome(500)).toBe('retryable-error')
  })
})
