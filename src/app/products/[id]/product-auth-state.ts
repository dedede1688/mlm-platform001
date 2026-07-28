export type ProductUserLoadStatus = 'anonymous' | 'loading' | 'ready' | 'error'

export type ProductPurchaseAuthDecision =
  | 'allow'
  | 'wait'
  | 'redirect-login'
  | 'retryable-error'

export function getProductUserResponseOutcome(
  status: number
): 'authenticated' | 'unauthorized' | 'retryable-error' {
  if (status >= 200 && status < 300) return 'authenticated'
  if (status === 401) return 'unauthorized'
  return 'retryable-error'
}

export function getProductPurchaseAuthDecision(input: {
  hasToken: boolean
  userReady: boolean
  userLoadStatus: ProductUserLoadStatus
}): ProductPurchaseAuthDecision {
  if (!input.hasToken) return 'redirect-login'
  if (input.userLoadStatus === 'loading') return 'wait'
  if (input.userLoadStatus === 'error') return 'retryable-error'
  if (input.userLoadStatus === 'ready' && input.userReady) return 'allow'
  return 'retryable-error'
}
