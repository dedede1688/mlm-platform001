// 会员等级
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

// 奖励比例
export const REWARD_RATES = {
  REFERRAL: 0.20,
  BRAND_BONUS: 0.20,
  DIVIDEND: 0.05,
}

// 积分解锁配置
export const POINTS_CONFIG = {
  UNLOCK_RATE: 0.01,
  UNLOCK_DAYS: 100,
  UPGRADE_THRESHOLD: 10,
}

// 升级条件
export const UPGRADE_CONDITIONS = {
  DIRECTOR: { directDistributors: 3, directSales: 50000 },
  MANAGER: { directDistributors: 6, directSales: 100000 },
  SUPERVISOR: { directDistributors: 9, directSales: 200000 },
  PRESIDENT: { directDistributors: 15, directSales: 500000 },
  BOARD: { directDistributors: 30, directSales: 1000000 },
}

// 品牌管理奖层级解锁
export const BRAND_BONUS_LEVELS: Record<number, number> = {
  0: 0,
  1: 2,
  2: 4,
  3: 10,
}

// 订单状态
export const ORDER_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  SHIPPED: 'shipped',
  COMPLETED: 'completed',
  REFUNDED: 'refunded',
  CANCELLED: 'cancelled',
} as const

// 提现状态
export const WITHDRAWAL_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const

// 积分记录类型
export const POINTS_RECORD_TYPE = {
  EARN: 'earn',
  UNLOCK: 'unlock',
  USE: 'use',
  TRANSFER_IN: 'transfer_in',
  TRANSFER_OUT: 'transfer_out',
  VOID: 'void',
} as const

// 奖励类型
export const REWARD_TYPE = {
  REFERRAL: 'referral',
  BRAND_BONUS: 'brand_bonus',
  DIVIDEND: 'dividend',
} as const
