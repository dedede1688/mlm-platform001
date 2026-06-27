import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { logger } from '@/lib/logger'
import { sendSms } from '@/lib/notification/sendSms'

const RESET_CODE_EXPIRY_MINUTES = 5
const SALT_ROUNDS = 10

export class AuthService {
  // ===========================
  // 改密（用户登录后）
  // ===========================
  static async changePassword(params: {
    userId: string
    oldPassword: string
    newPassword: string
  }): Promise<void> {
    const { userId, oldPassword, newPassword } = params

    // 1. 新密码强度校验
    if (newPassword.length < 8) {
      throw new Error('新密码至少 8 位')
    }
    if (newPassword === oldPassword) {
      throw new Error('新密码不能与旧密码相同')
    }

    // 2. 查用户
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    })
    if (!user) throw new Error('用户不存在')

    // 3. 校验旧密码
    const isValid = await bcrypt.compare(oldPassword, user.passwordHash)
    if (!isValid) throw new Error('旧密码错误')

    // 4. 加密新密码
    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS)

    // 5. 更新
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    })

    logger.info(`[v56.1 AuthService] 用户改密成功: ${userId}`)
  }

  // ===========================
  // 找回密码 - 发验证码
  // ===========================
  static async sendResetCode(phone: string): Promise<{ expiresIn: number }> {
    // 1. 查用户是否存在（不暴露用户存在性——统一返回成功）
    const user = await prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    })
    if (!user) {
      // 安全考虑：手机号不存在也返回成功（避免泄露用户存在性）
      logger.warn(`[v56.1 AuthService] 找回密码手机号不存在: ${phone}`)
      return { expiresIn: RESET_CODE_EXPIRY_MINUTES * 60 }
    }

    // 2. 生成 6 位验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString()

    // 3. 设置过期时间
    const expiresAt = new Date(Date.now() + RESET_CODE_EXPIRY_MINUTES * 60 * 1000)

    // 4. 失效旧验证码（防刷）
    await prisma.passwordResetCode.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    })

    // 5. 创建新验证码
    await prisma.passwordResetCode.create({
      data: {
        userId: user.id,
        phone,
        code,
        expiresAt,
      },
    })

    // 6. 发送短信（v56.1 mock 模式：sendSms 当前是 console.log 模拟）
    await sendSms({
      to: phone,
      templateType: 'password_reset',
      variables: { code, expireMinutes: String(RESET_CODE_EXPIRY_MINUTES) },
    }).catch((err: unknown) => {
      logger.error('[v56.1 AuthService] 发送验证码短信失败', { phone, error: String(err) })
    })

    logger.info(`[v56.1 AuthService] 找回密码验证码已发送: ${phone} (mock: ${code})`)

    return { expiresIn: RESET_CODE_EXPIRY_MINUTES * 60 }
  }

  // ===========================
  // 找回密码 - 校验验证码
  // ===========================
  static async verifyResetCode(phone: string, code: string): Promise<{ valid: boolean; userId?: string }> {
    const record = await prisma.passwordResetCode.findFirst({
      where: {
        phone,
        code,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!record) return { valid: false }
    return { valid: true, userId: record.userId }
  }

  // ===========================
  // 找回密码 - 重置密码
  // ===========================
  static async resetPassword(params: {
    phone: string
    code: string
    newPassword: string
  }): Promise<void> {
    const { phone, code, newPassword } = params

    // 1. 新密码强度校验
    if (newPassword.length < 8) {
      throw new Error('新密码至少 8 位')
    }

    // 2. 校验验证码
    const verifyResult = await this.verifyResetCode(phone, code)
    if (!verifyResult.valid || !verifyResult.userId) {
      throw new Error('验证码无效或已过期')
    }

    // 3. 加密新密码
    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS)

    // 4. 更新密码
    await prisma.user.update({
      where: { id: verifyResult.userId },
      data: { passwordHash: newPasswordHash },
    })

    // 5. 标记验证码为已使用
    await prisma.passwordResetCode.updateMany({
      where: { phone, code, used: false },
      data: { used: true },
    })

    logger.info(`[v56.1 AuthService] 密码重置成功: ${phone}`)
  }
}
