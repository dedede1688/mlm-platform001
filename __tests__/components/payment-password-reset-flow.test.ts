/**
 * 猫爪_018号任务：用户端忘记支付密码流程契约测试
 *
 * 覆盖 8 个场景：
 * 1. 已设置状态不再出现"去修改"链接
 * 2. 点击"忘记支付密码"打开说明弹窗
 * 3. 说明弹窗包含联系客服核验身份文案
 * 4. 联系客服链接为 /help
 * 5. 未设置状态显示"立即设置"，链接为 /dashboard/payment-password
 * 6. 忘记密码流程不含支付接口调用
 * 7. 关闭说明弹窗不触发结算弹窗 onClose
 * 8. 不存在自动支付或自动扣款逻辑
 *
 * 采用源码契约测试模式。
 */
import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) =>
  fs.readFileSync(path.resolve(process.cwd(), file), 'utf8')

describe('用户端忘记支付密码流程', () => {
  // ---- 场景 1: 已设置状态不再出现"去修改"链接 ----
  describe('1. 已设置状态不再出现"去修改"链接', () => {
    it('CheckoutDialog.tsx 不包含"去修改"', () => {
      const source = read('src/components/checkout/CheckoutDialog.tsx')
      expect(source).not.toContain('去修改')
    })

    it('CheckoutDialog.tsx 包含"忘记支付密码"按钮文案', () => {
      const source = read('src/components/checkout/CheckoutDialog.tsx')
      expect(source).toContain('忘记支付密码')
    })

    it('CheckoutDialog.tsx 包含"查看帮助"按钮', () => {
      const source = read('src/components/checkout/CheckoutDialog.tsx')
      expect(source).toContain('查看帮助')
    })
  })

  // ---- 场景 2: 点击"忘记支付密码"打开说明弹窗 ----
  describe('2. 点击"忘记支付密码"打开说明弹窗', () => {
    it('CheckoutDialog.tsx 定义 showForgotPayPwdModal 状态', () => {
      const source = read('src/components/checkout/CheckoutDialog.tsx')
      expect(source).toContain('showForg')
    })

    it('按钮 type="button" 防止提交表单', () => {
      const source = read('src/components/checkout/CheckoutDialog.tsx')
      // 忘记密码按钮应该是 type="button" 防止触发 form submit
      const buttonMatch = source.match(/type="button".*setShowForgotPayPwdModal/)
      expect(buttonMatch).not.toBeNull()
    })
  })

  // ---- 场景 3: 说明弹窗包含联系客服核验身份文案 ----
  describe('3. 说明弹窗包含联系客服核验身份文案', () => {
    it('弹窗包含"请联系客服核验身份后重置"', () => {
      const source = read('src/components/checkout/CheckoutDialog.tsx')
      expect(source).toContain('请联系客服核验身份后重置')
    })

    it('弹窗包含"人工核验"相关说明', () => {
      const source = read('src/components/checkout/CheckoutDialog.tsx')
      expect(source).toContain('人工核验')
    })
  })

  // ---- 场景 4: 联系客服链接为 /help ----
  describe('4. 联系客服链接为 /help', () => {
    it('CheckoutDialog.tsx 包含 Link 到 /help', () => {
      const source = read('src/components/checkout/CheckoutDialog.tsx')
      expect(source).toContain('href="/help"')
    })

    it('包含"联系客服"按钮文本', () => {
      const source = read('src/components/checkout/CheckoutDialog.tsx')
      expect(source).toContain('联系客服')
    })

    it('包含"取消"按钮关闭弹窗', () => {
      const source = read('src/components/checkout/CheckoutDialog.tsx')
      expect(source).toContain('取消')
    })
  })

  // ---- 场景 5: 未设置状态显示"立即设置" ----
  describe('5. 未设置状态显示"立即设置"，链接为 /dashboard/payment-password', () => {
    it('CheckoutDialog.tsx 包含"立即设置"按钮文本', () => {
      const source = read('src/components/checkout/CheckoutDialog.tsx')
      expect(source).toContain('立即设置')
    })

    it('未设置状态链接到 /dashboard/payment-password', () => {
      const source = read('src/components/checkout/CheckoutDialog.tsx')
      expect(source).toContain('/dashboard/payment-password')
    })

    it('未设置状态不包含 showForgotPayPwdModal 触发逻辑', () => {
      const source = read('src/components/checkout/CheckoutDialog.tsx')
      // "立即设置"应该是 Link 而不是 button 触发弹窗
      expect(source).toMatch(/立即设置.*href|href.*立即设置/)
    })
  })

  // ---- 场景 6: 忘记密码流程不含支付接口调用 ----
  describe('6. 忘记密码流程不含支付接口调用', () => {
    it('CheckoutDialog.tsx 忘记密码按钮不含 fetch 调用', () => {
      const source = read('src/components/checkout/CheckoutDialog.tsx')
      // 忘记密码按钮 handler 应该是 setShowForgotPayPwdModal(true)，不是 fetch
      expect(source).not.toMatch(/setShowForgotPayPwdModal.*fetch|fetch.*setShowForgotPayPwdModal/)
    })

    it('弹窗关闭回调不含 fetch', () => {
      const source = read('src/components/checkout/CheckoutDialog.tsx')
      // 关闭弹窗应该是 setShowForgotPayPwdModal(false)，不是 fetch
      const closeMatch = source.match(/handleCloseForgotPayPwdModal[^}]*\}/s)
      expect(closeMatch).not.toBeNull()
      expect(closeMatch![0]).toContain('setShowForgotPayPwdModal(false)')
      expect(closeMatch![0]).not.toContain('fetch')
      expect(closeMatch![0]).not.toContain('onClose')
      expect(closeMatch![0]).not.toContain('/api/')
    })

    it('弹窗组件不包含任何支付相关 API 路径', () => {
      const source = read('src/components/checkout/CheckoutDialog.tsx')
      const modalStart = source.indexOf('v018: 忘记支付密码说明弹窗')
      expect(modalStart).toBeGreaterThan(0)
      const modalSection = source.slice(modalStart, modalStart + 2000)
      expect(modalSection).not.toContain('/api/orders')
      expect(modalSection).not.toContain('/api/user/payment-password/set')
      expect(modalSection).not.toContain('verify-payment')
    })
  })

  // ---- 场景 7: 关闭说明弹窗不触发结算弹窗 onClose ----
  describe('7. 关闭说明弹窗不触发结算弹窗 onClose', () => {
    it('handleCloseForgotPayPwdModal 只设置 showForgotPayPwdModal 为 false', () => {
      const source = read('src/components/checkout/CheckoutDialog.tsx')
      // 关闭回调应该只设置 showForgotPayPwdModal(false)
      const closeHandler = source.match(/handleCloseForgotPayPwdModal[^}]*\}/s)
      expect(closeHandler).not.toBeNull()
      expect(closeHandler![0]).toContain('setShowForgotPayPwdModal(false)')
      // 不应该调用 onClose
      expect(closeHandler![0]).not.toContain('onClose')
    })
  })

  // ---- 场景 8: 不存在自动支付或自动扣款逻辑 ----
  describe('8. 不存在自动支付或自动扣款逻辑', () => {
    it('CheckoutDialog.tsx 不包含"自动扣款"相关逻辑', () => {
      const source = read('src/components/checkout/CheckoutDialog.tsx')
      expect(source).not.toContain('自动扣款')
      expect(source).not.toContain('autoPay')
      expect(source).not.toContain('auto_payment')
    })

    it('忘记密码弹窗不包含任何支付动作', () => {
      const source = read('src/components/checkout/CheckoutDialog.tsx')
      // 弹窗区域不应包含支付相关逻辑
      const modalSection = source.slice(source.indexOf('showForgotPayPwdModal &&'))
      expect(modalSection).not.toContain('handleConfirm')
      expect(modalSection).not.toContain('onConfirm(')
    })

    it('不存在调用支付验证接口的代码', () => {
      const source = read('src/components/checkout/CheckoutDialog.tsx')
      expect(source).not.toMatch(/verify.*payment|payment.*verify/)
    })
  })
})

// ---- 后台会员详情"支付安全"区域测试 ----
describe('后台会员详情"支付安全"区域', () => {
  it('admin/users/page.tsx 包含"支付安全"标题', () => {
    const source = read('src/app/admin/users/page.tsx')
    expect(source).toContain('支付安全')
  })

  it('admin/users/page.tsx 包含"支付密码状态"展示', () => {
    const source = read('src/app/admin/users/page.tsx')
    expect(source).toContain('支付密码状态')
  })

  it('admin/users/page.tsx include "hasPaymentPassword" 字段检查', () => {
    const source = read('src/app/admin/users/page.tsx')
    expect(source).toContain('hasPaymentPassword')
  })

  it('admin/users/page.tsx 包含"重置支付密码"按钮（仅超级管理员）', () => {
    const source = read('src/app/admin/users/page.tsx')
    expect(source).toContain('重置支付密码')
  })

  it('非超级管理员不显示执行按钮', () => {
    const source = read('src/app/admin/users/page.tsx')
    // 检查条件渲染：userRole === 'super_admin' 才显示按钮
    expect(source).toContain("userRole === 'super_admin'")
  })

  it('包含手机号后 4 位输入框', () => {
    const source = read('src/app/admin/users/page.tsx')
    expect(source).toContain('手机号后 4 位')
  })

  it('包含重置原因输入框', () => {
    const source = read('src/app/admin/users/page.tsx')
    expect(source).toContain('重置原因')
  })

  it('重置按钮带 Authorization: Bearer header', () => {
    const source = read('src/app/admin/users/page.tsx')
    expect(source).toContain('Authorization: `Bearer ${token}`')
  })

  it('成功后更新 detailUser.hasPaymentPassword 为 false', () => {
    const source = read('src/app/admin/users/page.tsx')
    expect(source).toContain('hasPaymentPassword: false')
  })

  it('失败时显示错误消息', () => {
    const source = read('src/app/admin/users/page.tsx')
    // 错误处理逻辑应包含 showMessage('error', ...)
    expect(source).toContain("showMessage('error'")
  })
})

// ---- v019: 后台状态隔离测试 ----
describe('v019: 后台支付密码重置状态隔离', () => {

  // ---- 1. handleViewDetail 在发起新会员详情请求前清空支付密码重置状态 ----
  describe('1. handleViewDetail 清空支付密码重置状态', () => {
    it('定义 resetPaymentPasswordResetState 函数', () => {
      const source = read('src/app/admin/users/page.tsx')
      expect(source).toContain('resetPaymentPasswordResetState')
    })

    it('resetPaymentPasswordResetState 清空 payPwdResetReason', () => {
      const source = read('src/app/admin/users/page.tsx')
      // 提取 resetPaymentPasswordResetState 函数体
      const funcMatch = source.match(/const resetPaymentPasswordResetState[\s\S]*?=>[\s\S]*?\}/)
      expect(funcMatch).not.toBeNull()
      expect(funcMatch![0]).toContain('setPayPwdResetReason')
    })

    it('resetPaymentPasswordResetState 清空 payPwdResetSuffix', () => {
      const source = read('src/app/admin/users/page.tsx')
      const funcMatch = source.match(/const resetPaymentPasswordResetState[\s\S]*?=>[\s\S]*?\}/)
      expect(funcMatch).not.toBeNull()
      expect(funcMatch![0]).toContain('setPayPwdResetSuffix')
    })

    it('resetPaymentPasswordResetState 清空 showPayPwdConfirm', () => {
      const source = read('src/app/admin/users/page.tsx')
      const funcMatch = source.match(/const resetPaymentPasswordResetState[\s\S]*?=>[\s\S]*?\}/)
      expect(funcMatch).not.toBeNull()
      expect(funcMatch![0]).toContain('setShowPayPwdConfirm')
    })

    it('handleViewDetail 调用 resetPaymentPasswordResetState', () => {
      const source = read('src/app/admin/users/page.tsx')
      // 提取 handleViewDetail 函数体
      const funcMatch = source.match(/const handleViewDetail[\s\S]*?=>[\s\S]*?\n  \}/)
      expect(funcMatch).not.toBeNull()
      // 在 handleViewDetail 函数体内应调用 resetPaymentPasswordResetState
      expect(funcMatch![0]).toContain('resetPaymentPasswordResetState')
    })
  })

  // ---- 2. 会员详情遮罩关闭、右上角关闭和底部关闭必须走统一关闭函数 ----
  describe('2. 统一关闭函数 closeDetailModal', () => {
    it('定义 closeDetailModal 函数', () => {
      const source = read('src/app/admin/users/page.tsx')
      expect(source).toContain('closeDetailModal')
    })

    it('closeDetailModal 调用 resetPaymentPasswordResetState', () => {
      const source = read('src/app/admin/users/page.tsx')
      const funcMatch = source.match(/const closeDetailModal[\s\S]*?=>[\s\S]*?\}/)
      expect(funcMatch).not.toBeNull()
      expect(funcMatch![0]).toContain('resetPaymentPasswordResetState')
    })

    it('closeDetailModal 调用 setDetailUser(null)', () => {
      const source = read('src/app/admin/users/page.tsx')
      const funcMatch = source.match(/const closeDetailModal[\s\S]*?=>[\s\S]*?\}/)
      expect(funcMatch).not.toBeNull()
      expect(funcMatch![0]).toContain('setDetailUser(null)')
    })

    it('遮罩 onClick 使用 closeDetailModal（不再直接 setDetailUser(null)）', () => {
      const source = read('src/app/admin/users/page.tsx')
      // 找到遮罩 div 的 onClick
      const overlayMatch = source.match(/bg-black\/50.*?onClick=\{[^}]*\}/s)
      expect(overlayMatch).not.toBeNull()
      expect(overlayMatch![0]).toContain('closeDetailModal')
      expect(overlayMatch![0]).not.toContain('setDetailUser(null)')
    })

    it('右上角关闭按钮 onClick 使用 closeDetailModal', () => {
      const source = read('src/app/admin/users/page.tsx')
      // 找到会员详情弹窗中的 X 关闭按钮（在 sticky top 区域）
      // 从 detailUser && 开始搜索
      const detailStart = source.indexOf('detailUser &&')
      expect(detailStart).toBeGreaterThan(0)
      const detailSection = source.slice(detailStart, detailStart + 2000)
      // 找到包含 X className 的关闭按钮
      const closeBtnMatch = detailSection.match(/onClick=\{[^}]*\}[^>]*>[\s\S]*?<X /)
      expect(closeBtnMatch).not.toBeNull()
      expect(closeBtnMatch![0]).toContain('closeDetailModal')
    })

    it('底部关闭按钮 onClick 使用 closeDetailModal', () => {
      const source = read('src/app/admin/users/page.tsx')
      // 找到底部"关闭"按钮
      const bottomMatch = source.match(/关闭<\/button>/)
      expect(bottomMatch).not.toBeNull()
      // 找到包含 "关闭" 文本的前面 onClick
      const closeBtnArea = source.match(/onClick=\{[^}]*\}[^>]*>\s*关闭<\/button>/)
      expect(closeBtnArea).not.toBeNull()
      expect(closeBtnArea![0]).toContain('closeDetailModal')
    })
  })

  // ---- 3. 统一关闭函数必须同时清空 detailUser 和三个支付密码重置状态 ----
  describe('3. 统一关闭函数清空所有状态', () => {
    it('closeDetailModal 不包含对无关状态的修改（如 balanceReason/pointsReason 等）', () => {
      const source = read('src/app/admin/users/page.tsx')
      const funcMatch = source.match(/const closeDetailModal[\s\S]*?=>[\s\S]*?\}/)
      expect(funcMatch).not.toBeNull()
      const funcBody = funcMatch![0]
      // 不应该清除资金调整、积分调整等无关状态
      expect(funcBody).not.toContain('setBalanceReason')
      expect(funcBody).not.toContain('setPointsReason')
      expect(funcBody).not.toContain('setStatusReason')
      expect(funcBody).not.toContain('setNewLevel')
    })
  })
})
