/**
 * 支付密码策略模块 — 纯函数，无外部依赖
 *
 * - isValidNewPaymentPassword: 新密码格式校验（恰好6位ASCII数字）
 * - hasPaymentPasswordInput: 已有密码非空检查（不过滤、不trim）
 * - PAYMENT_PASSWORD_LENGTH: 新密码固定长度常量
 */

export const PAYMENT_PASSWORD_LENGTH = 6 as const

/** 新密码必须恰好为6位ASCII数字 */
export function isValidNewPaymentPassword(password: string): boolean {
  return /^\d{6}$/.test(password)
}

/** 已有密码只检查非空，不做trim或格式校验 */
export function hasPaymentPasswordInput(password: string): boolean {
  return password.length > 0
}