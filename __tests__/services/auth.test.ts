import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const createMockChain = () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  })

  const mockPrisma: any = {
    user: createMockChain(),
    passwordResetCode: createMockChain(),
    $transaction: vi.fn(),
  }
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
  return { prisma: mockPrisma }
})

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}))

vi.mock('@/lib/notification/sendSms', () => ({
  sendSms: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { AuthService } from '@/lib/services/auth.service'

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ========================================
  // changePassword
  // ========================================
  describe('changePassword', () => {
    it('旧密码错误时抛错', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ passwordHash: 'hashed' })
      vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never)

      await expect(
        AuthService.changePassword({ userId: 'u1', oldPassword: 'wrong', newPassword: 'newpass123' })
      ).rejects.toThrow('旧密码错误')

      expect(prisma.user.update).not.toHaveBeenCalled()
    })

    it('新密码与旧密码相同时抛错', async () => {
      await expect(
        AuthService.changePassword({ userId: 'u1', oldPassword: 'samepass', newPassword: 'samepass' })
      ).rejects.toThrow('新密码不能与旧密码相同')
    })

    it('新密码不足 8 位时抛错', async () => {
      await expect(
        AuthService.changePassword({ userId: 'u1', oldPassword: 'oldpass123', newPassword: 'short' })
      ).rejects.toThrow('新密码至少 8 位')
    })

    it('用户不存在时抛错', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null)

      await expect(
        AuthService.changePassword({ userId: 'nonexistent', oldPassword: 'oldpass123', newPassword: 'newpass123' })
      ).rejects.toThrow('用户不存在')
    })

    it('旧密码正确时成功改密', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ passwordHash: 'old-hash' })
      vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as never)
      vi.mocked(bcrypt.hash).mockResolvedValueOnce('new-hash' as never)
      prisma.user.update.mockResolvedValueOnce({})

      await AuthService.changePassword({ userId: 'u1', oldPassword: 'oldpass123', newPassword: 'newpass123' })

      expect(bcrypt.compare).toHaveBeenCalledWith('oldpass123', 'old-hash')
      expect(bcrypt.hash).toHaveBeenCalledWith('newpass123', 10)
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { passwordHash: 'new-hash' },
      })
    })
  })

  // ========================================
  // sendResetCode
  // ========================================
  describe('sendResetCode', () => {
    it('手机号不存在时也返回成功（不泄露用户存在性）', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null)

      const result = await AuthService.sendResetCode('13800138000')

      expect(result.expiresIn).toBe(300)
      expect(prisma.passwordResetCode.create).not.toHaveBeenCalled()
    })

    it('手机号存在时创建验证码并失效旧验证码', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1' })
      prisma.passwordResetCode.updateMany.mockResolvedValueOnce({ count: 0 })
      prisma.passwordResetCode.create.mockResolvedValueOnce({ id: 'code-1' })

      const result = await AuthService.sendResetCode('13800138000')

      expect(result.expiresIn).toBe(300)
      // 失效旧验证码
      expect(prisma.passwordResetCode.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', used: false },
        data: { used: true },
      })
      // 创建新验证码
      expect(prisma.passwordResetCode.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'u1',
            phone: '13800138000',
          }),
        })
      )
      // 验证码是 6 位数字
      const createCall = prisma.passwordResetCode.create.mock.calls[0][0]
      expect(createCall.data.code).toMatch(/^\d{6}$/)
    })
  })

  // ========================================
  // verifyResetCode
  // ========================================
  describe('verifyResetCode', () => {
    it('有效验证码返回 valid=true + userId', async () => {
      prisma.passwordResetCode.findFirst.mockResolvedValueOnce({
        id: 'code-1',
        userId: 'u1',
        phone: '13800138000',
        code: '123456',
        used: false,
        expiresAt: new Date(Date.now() + 60000),
      })

      const result = await AuthService.verifyResetCode('13800138000', '123456')

      expect(result.valid).toBe(true)
      expect(result.userId).toBe('u1')
    })

    it('无效验证码返回 valid=false', async () => {
      prisma.passwordResetCode.findFirst.mockResolvedValueOnce(null)

      const result = await AuthService.verifyResetCode('13800138000', 'wrong')

      expect(result.valid).toBe(false)
      expect(result.userId).toBeUndefined()
    })
  })

  // ========================================
  // resetPassword
  // ========================================
  describe('resetPassword', () => {
    it('验证码无效时抛错', async () => {
      prisma.passwordResetCode.findFirst.mockResolvedValueOnce(null)

      await expect(
        AuthService.resetPassword({ phone: '13800138000', code: 'wrong', newPassword: 'newpass123' })
      ).rejects.toThrow('验证码无效或已过期')

      expect(prisma.user.update).not.toHaveBeenCalled()
    })

    it('新密码不足 8 位时抛错', async () => {
      await expect(
        AuthService.resetPassword({ phone: '13800138000', code: '123456', newPassword: 'short' })
      ).rejects.toThrow('新密码至少 8 位')
    })

    it('验证码有效时成功重置密码', async () => {
      prisma.passwordResetCode.findFirst.mockResolvedValueOnce({
        id: 'code-1',
        userId: 'u1',
        phone: '13800138000',
        code: '123456',
        used: false,
        expiresAt: new Date(Date.now() + 60000),
      })
      vi.mocked(bcrypt.hash).mockResolvedValueOnce('new-hash' as never)
      prisma.user.update.mockResolvedValueOnce({})
      prisma.passwordResetCode.updateMany.mockResolvedValueOnce({ count: 1 })

      await AuthService.resetPassword({ phone: '13800138000', code: '123456', newPassword: 'newpass123' })

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { passwordHash: 'new-hash' },
      })
      // 验证码标记为已使用
      expect(prisma.passwordResetCode.updateMany).toHaveBeenCalledWith({
        where: { phone: '13800138000', code: '123456', used: false },
        data: { used: true },
      })
    })
  })
})
