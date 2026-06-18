import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 10

/**
 * Hash 支付密码（6 位数字）
 */
export async function hashPaymentPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

/**
 * 验证支付密码
 */
export async function verifyPaymentPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

/**
 * 校验密码格式（必须 6 位数字）
 */
export function isValidPaymentPassword(password: string): boolean {
  return /^\d{6}$/.test(password)
}
