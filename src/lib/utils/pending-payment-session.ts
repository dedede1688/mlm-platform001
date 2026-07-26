export interface ProductPendingPaymentSession {
  version: 1
  userId: string
  productId: string
  orderId: string
  shortage: number
}

export type PendingPaymentLoadResult =
  | { status: 'empty' }
  | { status: 'valid'; value: ProductPendingPaymentSession }
  | { status: 'invalid'; error: string }
  | { status: 'unavailable'; error: string }

export type PendingPaymentWriteResult =
  | { ok: true }
  | { ok: false; error: string }

export function getProductPendingPaymentKey(userId: string, productId: string): string {
  return `pending_payment:${userId}:${productId}`
}

function isValidSession(value: unknown): value is ProductPendingPaymentSession {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== 1) return false
  if (typeof v.userId !== 'string' || !v.userId) return false
  if (typeof v.productId !== 'string' || !v.productId) return false
  if (typeof v.orderId !== 'string' || !v.orderId) return false
  if (typeof v.shortage !== 'number' || !Number.isFinite(v.shortage as number) || (v.shortage as number) < 0) return false
  return true
}

export function loadProductPendingPayment(userId: string, productId: string): PendingPaymentLoadResult {
  const key = getProductPendingPaymentKey(userId, productId)
  let raw: string | null
  try {
    raw = sessionStorage.getItem(key)
  } catch {
    return { status: 'unavailable', error: 'sessionStorage 不可用' }
  }

  if (raw === null) return { status: 'empty' }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    try { sessionStorage.removeItem(key) } catch { /* ignore */ }
    return { status: 'invalid', error: '会话数据损坏' }
  }

  if (!isValidSession(parsed)) {
    try { sessionStorage.removeItem(key) } catch { /* ignore */ }
    return { status: 'invalid', error: '会话格式无效' }
  }

  if (parsed.userId !== userId || parsed.productId !== productId) {
    try { sessionStorage.removeItem(key) } catch { /* ignore */ }
    return { status: 'invalid', error: '会话用户或商品不匹配' }
  }

  return { status: 'valid', value: parsed }
}

export function saveProductPendingPayment(value: ProductPendingPaymentSession): PendingPaymentWriteResult {
  if (!isValidSession(value)) {
    return { ok: false, error: '会话数据校验失败' }
  }

  const key = getProductPendingPaymentKey(value.userId, value.productId)
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
    return { ok: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg || 'sessionStorage 写入失败' }
  }
}

export function clearProductPendingPayment(userId: string, productId: string): boolean {
  const key = getProductPendingPaymentKey(userId, productId)
  try {
    sessionStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

export function calculatePendingShortage(payAmount: number, balance: number): number | null {
  if (!Number.isFinite(payAmount) || !Number.isFinite(balance)) return null
  if (payAmount < 0 || balance < 0) return null
  return Math.max(0, payAmount - balance)
}