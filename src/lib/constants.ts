export const MEMBER_LEVELS = {
  VISITOR: 0,
  MEMBER: 1,
  DISTRIBUTOR: 2,
  DIRECTOR: 3,
  MANAGER: 4,
  SUPERVISOR: 5,
  PRESIDENT: 6,
  BOARD: 7,
} as const

export const MEMBER_LEVEL_NAMES: Record<number, string> = {
  0: '游客',
  1: '会员',
  2: '经销商',
  3: '主任',
  4: '经理',
  5: '总监',
  6: '总裁',
  7: '董事',
}

export const ORDER_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  SHIPPED: 'shipped',
  COMPLETED: 'completed',
  REFUNDED: 'refunded',
  CANCELLED: 'cancelled',
} as const

export const WITHDRAWAL_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  COMPLETED: 'completed',
} as const

export const POINTS_RECORD_TYPE = {
  EARN: 'earn',
  UNLOCK: 'unlock',
  USE: 'use',
  TRANSFER_IN: 'transfer_in',
  TRANSFER_OUT: 'transfer_out',
  VOID: 'void',
} as const

export const REWARD_TYPE = {
  REFERRAL: 'referral',
  BRAND_BONUS: 'brand_bonus',
  DIVIDEND: 'dividend',
} as const

// v54 阶段5: 余额/收益字段统一 select 常量（防并发/流水场景复用）
// 资金底座重构: 新增 earningsFrozen（收益冻结）
export const BALANCE_SELECT = {
  balance: true,
  frozenBalance: true,
  consumeBalance: true,
  earningsAvailable: true,
  earningsPending: true,
  earningsVoided: true,
  earningsFrozen: true,
} as const
