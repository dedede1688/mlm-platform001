export interface AdminOrderAction {
  label: string
  status: 'paid' | 'cancelled' | 'shipped' | 'completed'
  color: string
}

const ADMIN_ORDER_ACTIONS: Record<string, AdminOrderAction[]> = {
  pending: [
    {
      label: '标记已支付',
      status: 'paid',
      color: 'text-green-600 hover:bg-green-50',
    },
    {
      label: '取消订单',
      status: 'cancelled',
      color: 'text-red-600 hover:bg-red-50',
    },
  ],
  paid: [
    {
      label: '发货',
      status: 'shipped',
      color: 'text-blue-600 hover:bg-blue-50',
    },
  ],
  shipped: [
    {
      label: '完成订单',
      status: 'completed',
      color: 'text-green-600 hover:bg-green-50',
    },
  ],
}

export function getAdminOrderActions(status: string): AdminOrderAction[] {
  return ADMIN_ORDER_ACTIONS[status] || []
}

export function requiresOrderActionConfirmation(
  action: Pick<AdminOrderAction, 'status'>
): boolean {
  return action.status === 'cancelled'
}
