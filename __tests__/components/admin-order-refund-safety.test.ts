import { describe, expect, it } from 'vitest'

import {
  getAdminOrderActions,
  requiresOrderActionConfirmation,
} from '@/app/admin/orders/order-actions'
import { getClientApiError } from '@/lib/utils/client-api-error'

describe('admin order action safety', () => {
  it('only allows pending orders to be cancelled', () => {
    expect(getAdminOrderActions('pending').map(action => action.status))
      .toEqual(['paid', 'cancelled'])
    expect(getAdminOrderActions('paid').map(action => action.status))
      .toEqual(['shipped'])
    expect(getAdminOrderActions('shipped').map(action => action.status))
      .toEqual(['completed'])
  })

  it('requires a second confirmation for cancellation', () => {
    expect(requiresOrderActionConfirmation({ status: 'cancelled' })).toBe(true)
    expect(requiresOrderActionConfirmation({ status: 'paid' })).toBe(false)
    expect(requiresOrderActionConfirmation({ status: 'completed' })).toBe(false)
  })
})

describe('client API error extraction', () => {
  it('prefers the API error field used by errorResponse', () => {
    expect(getClientApiError(
      { success: false, error: '消费余额不足', message: '旧提示' },
      '操作失败'
    )).toBe('消费余额不足')
  })

  it('falls back to message and then the supplied default', () => {
    expect(getClientApiError({ message: '退款状态不是已审批' }, '操作失败'))
      .toBe('退款状态不是已审批')
    expect(getClientApiError({}, '操作失败')).toBe('操作失败')
    expect(getClientApiError(null, '操作失败')).toBe('操作失败')
  })
})
