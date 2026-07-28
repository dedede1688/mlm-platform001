import { describe, it, expect } from 'vitest'
import {
  isValidNewPaymentPassword,
  hasPaymentPasswordInput,
  PAYMENT_PASSWORD_LENGTH,
} from '@/lib/validations/payment-password-policy'

describe('isValidNewPaymentPassword', () => {
  describe('合法新密码（恰好6位ASCII数字）', () => {
    it('接受 000000', () => {
      expect(isValidNewPaymentPassword('000000')).toBe(true)
    })

    it('接受 123456', () => {
      expect(isValidNewPaymentPassword('123456')).toBe(true)
    })

    it('接受 987654', () => {
      expect(isValidNewPaymentPassword('987654')).toBe(true)
    })
  })

  describe('非法新密码', () => {
    it('拒绝空字符串', () => {
      expect(isValidNewPaymentPassword('')).toBe(false)
    })

    it('拒绝5位数字 12345', () => {
      expect(isValidNewPaymentPassword('12345')).toBe(false)
    })

    it('拒绝7位数字 1234567', () => {
      expect(isValidNewPaymentPassword('1234567')).toBe(false)
    })

    it('拒绝字母数字混合 abc123', () => {
      expect(isValidNewPaymentPassword('abc123')).toBe(false)
    })

    it('拒绝纯字母 abcdef', () => {
      expect(isValidNewPaymentPassword('abcdef')).toBe(false)
    })

    it('拒绝含空格 12 345', () => {
      expect(isValidNewPaymentPassword('12 345')).toBe(false)
    })

    it('拒绝全角数字 １２３４５６', () => {
      expect(isValidNewPaymentPassword('１２３４５６')).toBe(false)
    })
  })
})

describe('hasPaymentPasswordInput', () => {
  it('6位数字为非空', () => {
    expect(hasPaymentPasswordInput('123456')).toBe(true)
  })

  it('字母数字混合为非空', () => {
    expect(hasPaymentPasswordInput('abc123')).toBe(true)
  })

  it('带首尾空格的存量原文为非空', () => {
    expect(hasPaymentPasswordInput(' abc123 ')).toBe(true)
  })

  it('空字符串为空', () => {
    expect(hasPaymentPasswordInput('')).toBe(false)
  })
})

describe('PAYMENT_PASSWORD_LENGTH', () => {
  it('常量为6', () => {
    expect(PAYMENT_PASSWORD_LENGTH).toBe(6)
  })
})