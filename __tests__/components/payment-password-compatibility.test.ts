import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

function readSrc(relPath: string) {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8')
}

const OLD_ALPHANUM_REGEX = '(?=.*[a-zA-Z])(?=.*\\d).{6,}'

describe('前端源码契约 — CheckoutDialog', () => {
  const src = readSrc('src/components/checkout/CheckoutDialog.tsx')

  it('包含 hasPaymentPasswordInput(payPassword) 校验', () => {
    expect(src).toContain('hasPaymentPasswordInput(payPassword)')
  })

  it('支付密码输入使用 setPayPassword(e.target.value.slice(0, 20))', () => {
    expect(src).toContain('setPayPassword(e.target.value.slice(0, 20))')
  })

  it('不对 payPassword 调用 replace(/\\D/g, \'\')', () => {

    expect(src).not.toMatch(/payPassword.*replace\(.\\D/)
  })

  it('不包含旧字母数字格式正则', () => {
    expect(src).not.toContain(OLD_ALPHANUM_REGEX)
  })
})

describe('前端源码契约 — PaymentPasswordModal', () => {
  const src = readSrc('src/components/dashboard/PaymentPasswordModal.tsx')

  it('包含 const isValid = hasPaymentPasswordInput(password)', () => {
    expect(src).toContain('const isValid = hasPaymentPasswordInput(password)')
  })

  it('确认按钮包含 disabled={loading || !isValid}', () => {
    expect(src).toContain('disabled={loading || !isValid}')
  })

  it('输入使用 setPassword(e.target.value.slice(0, 20))', () => {
    expect(src).toContain('setPassword(e.target.value.slice(0, 20))')
  })

  it('不对 password 做数字过滤 replace(/\\D/g, \'\')', () => {
    expect(src).not.toMatch(/password.*replace\(.\\D/)
  })

  it('不包含旧字母数字格式正则', () => {
    expect(src).not.toContain(OLD_ALPHANUM_REGEX)
  })
})

describe('前端源码契约 — withdrawals 页面', () => {
  const src = readSrc('src/app/dashboard/withdrawals/page.tsx')

  it('包含 if (!paymentPassword) 前端校验', () => {
    expect(src).toContain('if (!paymentPassword)')
  })

  it('请求体确实传入 paymentPassword', () => {
    expect(src).toContain('paymentPassword,')
  })

  it('不包含旧字母数字格式正则', () => {
    expect(src).not.toContain(OLD_ALPHANUM_REGEX)
  })

  it('不得使用 isValidNewPaymentPassword 校验提现密码', () => {
    expect(src).not.toContain('isValidNewPaymentPassword')
  })
})

describe('前端源码契约 — 独立订单支付页', () => {
  const src = readSrc('src/app/payment/order/[orderId]/page.tsx')

  it('包含 window.prompt(\'请输入支付密码\')', () => {
    expect(src).toContain("window.prompt('请输入支付密码')")
  })

  it('包含 if (!password) return', () => {
    expect(src).toContain('if (!password) return')
  })

  it('包含 body: JSON.stringify({ password })', () => {
    expect(src).toContain('body: JSON.stringify({ password })')
  })

  it('不得出现6位格式校验或 isValidNewPaymentPassword', () => {
    expect(src).not.toContain('isValidNewPaymentPassword')
    expect(src).not.toContain('PAYMENT_PASSWORD_LENGTH')
    expect(src).not.toContain('replace(/\\D/g')
  })
})

describe('前端源码契约 — 支付密码设置页', () => {
  const src = readSrc('src/app/dashboard/payment-password/page.tsx')

  it('当前密码字段使用 setOldPassword(e.target.value.slice(0, 20))', () => {
    expect(src).toContain('setOldPassword(e.target.value.slice(0, 20))')
  })

  it('当前密码不得调用 replace(/\\D/g, \'\')', () => {
    expect(src).not.toMatch(/oldPassword.*replace\(.\\D/)
  })

  it('新密码字段使用 replace(/\\D/g, \'\').slice(0, PAYMENT_PASSWORD_LENGTH)', () => {
    expect(src).toContain("setNewPassword(e.target.value.replace(/\\D/g, '').slice(0, PAYMENT_PASSWORD_LENGTH))")
  })

  it('确认密码字段使用 replace(/\\D/g, \'\').slice(0, PAYMENT_PASSWORD_LENGTH)', () => {
    expect(src).toContain("setConfirmPassword(e.target.value.replace(/\\D/g, '').slice(0, PAYMENT_PASSWORD_LENGTH))")
  })

  it('新密码提交校验必须使用 isValidNewPaymentPassword', () => {
    expect(src).toContain('isValidNewPaymentPassword')
  })

  it('包含 inputMode="numeric"', () => {
    expect(src).toContain('inputMode="numeric"')
  })

  it('不包含旧字母数字格式正则', () => {
    expect(src).not.toContain(OLD_ALPHANUM_REGEX)
  })
})

describe('OrderLifecycleService — 源码级调用链验证', () => {
  it('verifyPayment 将 password 原样传给 verifyPaymentPassword（源码证据）', async () => {
    const src = readSrc('src/lib/services/order-lifecycle.service.ts')
    expect(src).toContain('verifyPaymentPassword(password,')
    expect(src).not.toContain('isValidNewPaymentPassword')
    expect(src).not.toContain('hasPaymentPasswordInput')
  })
})
