/**
 * 购物车余额不足 → 收益转余额 → 复用待支付订单 流程契约测试
 *
 * v015 重构：单值 pendingOrder + 单值 shortage → 按商品索引的 pendingPayments 字典
 *
 * 锁定关键行为：
 * 1. 数据模型：Record<string, PendingCartPayment>，不再有单个 PendingCartOrder | null
 * 2. A→B→A 订单复用：读取/写入/删除三个方向都按 cartItemId 操作
 * 3. 每件商品独立保存 shortage
 * 4. A→B→A 场景契约：A 的 orderA/shortageA 不会被 B 覆盖
 * 5. 转入成功回调不调用 verify-payment（不自动支付）
 * 6. 转入成功回调只更新当前商品缺口
 * 7. 关闭弹窗保留所有 pendingPayments 记录
 * 8. 014 修复保留：关闭弹窗关闭收益转余额弹窗
 * 9. EarningsTransferModal 将实际转入金额传给 onSuccess
 * 10. CheckoutDialog 余额不足提示区
 *
 * 采用源码契约测试模式（读取源码断言关键调用关系）。
 */
import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) =>
  fs.readFileSync(path.resolve(process.cwd(), file), 'utf8')

/**
 * 从源码中提取两个标记之间的真实函数体
 */
function extractBlock(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start)

  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)

  return source.slice(start, end)
}

describe('购物车余额不足 → 收益转余额 → 复用待支付订单', () => {
  // ---- v015: 数据模型测试 ----

  describe('1. 数据模型：按 cartItemId 索引的 pendingPayments 字典', () => {
    it('cart/page.tsx 定义 PendingCartPayment 接口（含 orderId + shortage）', () => {
      const source = read('src/app/cart/page.tsx')
      expect(source).toContain('PendingCartPayment')
      expect(source).toContain('orderId')
      expect(source).toContain('shortage')
    })

    it('cart/page.tsx 使用 Record<string, PendingCartPayment> 状态', () => {
      const source = read('src/app/cart/page.tsx')
      expect(source).toMatch(/Record<string,\s*PendingCartPayment/)
    })

    it('cart/page.tsx 不再使用单个 PendingCartOrder | null 状态', () => {
      const source = read('src/app/cart/page.tsx')
      expect(source).not.toMatch(/useState<PendingCartOrder\s*\|\s*null>/)
    })

    it('cart/page.tsx 不再使用单个 shortage 标量状态', () => {
      const source = read('src/app/cart/page.tsx')
      expect(source).not.toMatch(/const\s+\[shortage,\s*setShortage\]\s*=\s*useState<number>/)
    })
  })

  // ---- v015: A→B→A 订单复用测试 ----

  describe('2. A→B→A 订单复用：读取/写入/删除三个方向', () => {
    it('handleCheckoutConfirm 从 pendingPayments[checkoutItem.id] 读取待支付记录', () => {
      const source = read('src/app/cart/page.tsx')
      const block = extractBlock(source, 'const handleCheckoutConfirm', 'const handleEarningsTransferSuccess')
      // 必须从 pendingPayments 字典按 checkoutItem.id 读取
      expect(block).toMatch(/pendingPayments\[checkoutItem\.id\]/)
    })

    it('handleCheckoutConfirm 已有记录时直接使用其 orderId', () => {
      const source = read('src/app/cart/page.tsx')
      const block = extractBlock(source, 'const handleCheckoutConfirm', 'const handleEarningsTransferSuccess')
      // 条件判断 + 复用 orderId
      expect(block).toMatch(/\.orderId/)
    })

    it('handleCheckoutConfirm 新订单写入使用函数式更新保留其他商品', () => {
      const source = read('src/app/cart/page.tsx')
      const block = extractBlock(source, 'const handleCheckoutConfirm', 'const handleEarningsTransferSuccess')
      // 必须用 prev => ({ ...prev, ... }) 展开旧记录
      expect(block).toMatch(/setPendingPayments\(\s*prev\s*=>/)
      expect(block).toMatch(/\.\.\.prev/)
    })

    it('handleCheckoutConfirm 支付成功后只删除当前商品记录', () => {
      const source = read('src/app/cart/page.tsx')
      const block = extractBlock(source, 'const handleCheckoutConfirm', 'const handleEarningsTransferSuccess')
      // 必须用 delete next[checkoutItem.id] 而非 setPendingPayments({})
      expect(block).toMatch(/delete\s+next\[checkoutItem\.id\]/)
      expect(block).not.toMatch(/setPendingPayments\(\s*\{\s*\}\s*\)/)
    })
  })

  // ---- v015: 每件商品独立保存 shortage ----

  describe('3. 每件商品独立保存余额缺口', () => {
    it('handleCheckoutConfirm 余额不足时把 actualShortage 写入当前商品记录', () => {
      const source = read('src/app/cart/page.tsx')
      const block = extractBlock(source, 'const handleCheckoutConfirm', 'const handleEarningsTransferSuccess')
      // 余额不足处理中必须写入 shortage 到 pendingPayments
      expect(block).toMatch(/shortage:\s*actualShortage/)
    })

    it('页面从当前商品记录读取 currentShortage', () => {
      const source = read('src/app/cart/page.tsx')
      // 必须有从 pendingPayments 取 shortage 的逻辑
      expect(source).toMatch(/currentPendingPayment|currentShortage/)
    })

    it('页面不再有全局 setShortage 调用', () => {
      const source = read('src/app/cart/page.tsx')
      // 不应该存在独立的 setShortage 调用（已合并到 setPendingPayments）
      expect(source).not.toMatch(/setShortage\(/)
    })
  })

  // ---- v015: A→B→A 场景契约 ----

  describe('4. A→B→A 场景契约', () => {
    it('纯对象字典不会互相覆盖（数据结构验证）', () => {
      // 验证 Record<string, PendingCartPayment> 字典语义
      type PendingCartPayment = { orderId: string; shortage: number }
      const pendingPayments: Record<string, PendingCartPayment> = {}

      // A 创建订单
      pendingPayments['cartA'] = { orderId: 'orderA', shortage: 100 }
      expect(pendingPayments['cartA'].orderId).toBe('orderA')
      expect(pendingPayments['cartA'].shortage).toBe(100)

      // B 创建订单（不覆盖 A）
      pendingPayments['cartB'] = { orderId: 'orderB', shortage: 200 }
      expect(pendingPayments['cartA'].orderId).toBe('orderA')
      expect(pendingPayments['cartA'].shortage).toBe(100)
      expect(pendingPayments['cartB'].orderId).toBe('orderB')
      expect(pendingPayments['cartB'].shortage).toBe(200)

      // 从 B 返回 A 仍读取 orderA/shortageA
      expect(pendingPayments['cartA'].orderId).toBe('orderA')
      expect(pendingPayments['cartA'].shortage).toBe(100)

      // A 支付成功只删除 A
      delete pendingPayments['cartA']
      expect(pendingPayments['cartA']).toBeUndefined()
      expect(pendingPayments['cartB'].orderId).toBe('orderB')
      expect(pendingPayments['cartB'].shortage).toBe(200)
    })

    it('真实页面代码使用 pendingPayments 字典（非单值 pendingOrder）', () => {
      const source = read('src/app/cart/page.tsx')
      // 必须存在 pendingPayments 状态变量
      expect(source).toMatch(/pendingPayments/)
      // 不能存在单个 pendingOrder 状态变量
      expect(source).not.toMatch(/const\s+\[pendingOrder,\s*setPendingOrder\]/)
    })
  })

  // ---- v015: 收益转入成功回调 ----

  describe('5. 收益转入成功回调不自动支付', () => {
    it('handleEarningsTransferSuccess 函数体不包含 verify-payment', () => {
      const source = read('src/app/cart/page.tsx')
      const block = extractBlock(source, 'const handleEarningsTransferSuccess', 'const handleCheckoutClose')
      expect(block).not.toContain('verify-payment')
    })

    it('handleEarningsTransferSuccess 函数体不调用 handleCheckoutConfirm', () => {
      const source = read('src/app/cart/page.tsx')
      const block = extractBlock(source, 'const handleEarningsTransferSuccess', 'const handleCheckoutClose')
      expect(block).not.toContain('handleCheckoutConfirm')
    })

    it('handleEarningsTransferSuccess 函数体仍调用 fetchUserInfo 刷新资金', () => {
      const source = read('src/app/cart/page.tsx')
      const block = extractBlock(source, 'const handleEarningsTransferSuccess', 'const handleCheckoutClose')
      expect(block).toContain('fetchUserInfo')
    })

    it('handleEarningsTransferSuccess 函数体保留提示用户重新确认支付的消息', () => {
      const source = read('src/app/cart/page.tsx')
      const block = extractBlock(source, 'const handleEarningsTransferSuccess', 'const handleCheckoutClose')
      expect(block).toContain('余额已补足，请再次确认支付')
    })
  })

  describe('6. 收益转入只更新当前商品缺口', () => {
    it('handleEarningsTransferSuccess 使用 setPendingPayments 函数式更新', () => {
      const source = read('src/app/cart/page.tsx')
      const block = extractBlock(source, 'const handleEarningsTransferSuccess', 'const handleCheckoutClose')
      expect(block).toMatch(/setPendingPayments\(\s*prev\s*=>/)
      expect(block).toMatch(/\.\.\.prev/)
    })

    it('handleEarningsTransferSuccess 只修改 checkoutItem.id 对应记录', () => {
      const source = read('src/app/cart/page.tsx')
      const block = extractBlock(source, 'const handleEarningsTransferSuccess', 'const handleCheckoutClose')
      expect(block).toMatch(/checkoutItem\.id/)
    })

    it('handleEarningsTransferSuccess 在 checkoutItem 为空时安全返回', () => {
      const source = read('src/app/cart/page.tsx')
      const block = extractBlock(source, 'const handleEarningsTransferSuccess', 'const handleCheckoutClose')
      // 必须有 checkoutItem 为空的保护
      expect(block).toMatch(/!checkoutItem|checkoutItem\s*===\s*null/)
    })
  })

  // ---- v016: 禁止收益转入回调创建空订单编号伪记录 ----

  describe('6b. 收益转入回调禁止空订单编号伪记录', () => {
    it('handleEarningsTransferSuccess 函数体不包含空字符串兜底 ?? \'\'', () => {
      const source = read('src/app/cart/page.tsx')
      const block = extractBlock(source, 'const handleEarningsTransferSuccess', 'const handleCheckoutClose')
      expect(block).not.toContain("?? ''")
    })

    it('handleEarningsTransferSuccess 函数式更新中从 prev 读取当前记录 const current = prev[checkoutItem.id]', () => {
      const source = read('src/app/cart/page.tsx')
      const block = extractBlock(source, 'const handleEarningsTransferSuccess', 'const handleCheckoutClose')
      // 必须在 setPendingPayments 回调内从 prev 按 checkoutItem.id 读取
      expect(block).toMatch(/prev\[checkoutItem\.id\]/)
    })

    it('handleEarningsTransferSuccess 当前记录不存在时 return prev', () => {
      const source = read('src/app/cart/page.tsx')
      const block = extractBlock(source, 'const handleEarningsTransferSuccess', 'const handleCheckoutClose')
      // 必须有记录不存在时的 return prev 保护
      expect(block).toMatch(/return\s+prev/)
    })

    it('handleEarningsTransferSuccess 更新后的 orderId 来自现有记录（current.orderId 或 ...current）', () => {
      const source = read('src/app/cart/page.tsx')
      const block = extractBlock(source, 'const handleEarningsTransferSuccess', 'const handleCheckoutClose')
      // 必须用 current.orderId 或 ...current 展开保留 orderId，不能用空字符串兜底
      expect(block).toMatch(/current\.orderId|\.\.\.current/)
    })
  })

  // ---- v015: 关闭弹窗保留所有记录 ----

  describe('7. 关闭弹窗保留所有 pendingPayments 记录', () => {
    it('handleCheckoutClose 调用 setShowEarningsTransfer(false)', () => {
      const source = read('src/app/cart/page.tsx')
      const block = extractBlock(source, 'const handleCheckoutClose', 'const handleGoRecharge')
      expect(block).toContain('setShowEarningsTransfer(false)')
    })

    it('handleCheckoutClose 不调用 setPendingPayments 清空操作', () => {
      const source = read('src/app/cart/page.tsx')
      const block = extractBlock(source, 'const handleCheckoutClose', 'const handleGoRecharge')
      expect(block).not.toMatch(/setPendingPayments\(/)
    })

    it('handleCheckoutClose 保留"订单已创建，可在我的订单中继续支付"提示', () => {
      const source = read('src/app/cart/page.tsx')
      const block = extractBlock(source, 'const handleCheckoutClose', 'const handleGoRecharge')
      expect(block).toContain('订单已创建，可在我的订单中继续支付')
    })
  })

  // ---- v015: handleBuyNow 适配字典状态 ----

  describe('8. handleBuyNow 适配字典状态', () => {
    it('handleBuyNow 每次打开弹窗前关闭收益转余额弹窗', () => {
      const source = read('src/app/cart/page.tsx')
      const block = extractBlock(source, 'const handleBuyNow', 'const handleCheckoutConfirm')
      expect(block).toContain('setShowEarningsTransfer(false)')
    })

    it('handleBuyNow 不再调用 setShortage', () => {
      const source = read('src/app/cart/page.tsx')
      const block = extractBlock(source, 'const handleBuyNow', 'const handleCheckoutConfirm')
      expect(block).not.toMatch(/setShortage/)
    })
  })

  // ---- 保留的基础测试 ----

  describe('9. 购物车页面识别 INSUFFICIENT_BALANCE', () => {
    it('cart/page.tsx 包含 INSUFFICIENT_BALANCE 错误码识别', () => {
      const source = read('src/app/cart/page.tsx')
      expect(source).toContain('INSUFFICIENT_BALANCE')
    })
  })

  describe('10. 默认转入金额使用 Math.min(currentShortage, earningsAvailable)', () => {
    it('cart/page.tsx 计算 initialAmount = Math.min(currentShortage, earningsAvailable)', () => {
      const source = read('src/app/cart/page.tsx')
      expect(source).toMatch(/Math\.min\s*\(\s*currentShortage/)
      expect(source).toMatch(/earningsAvailable\s*\)/)
    })
  })

  describe('11. 可用收益为 0 时不打开收益转余额弹窗', () => {
    it('cart/page.tsx 包含 earningsAvailable > 0 条件守卫', () => {
      const source = read('src/app/cart/page.tsx')
      expect(source).toMatch(/earningsAvailable\s*>\s*0/)
    })
  })

  describe('12. 已有待支付订单时主按钮显示"重新确认支付"', () => {
    it('CheckoutDialog.tsx 包含 hasPendingOrder 可选参数', () => {
      const source = read('src/components/checkout/CheckoutDialog.tsx')
      expect(source).toContain('hasPendingOrder')
    })

    it('CheckoutDialog.tsx 包含"重新确认支付"按钮文案', () => {
      const source = read('src/components/checkout/CheckoutDialog.tsx')
      expect(source).toContain('重新确认支付')
    })
  })

  describe('13. EarningsTransferModal 将实际转入金额传给 onSuccess', () => {
    it('EarningsTransferModal.tsx onSuccess 类型签名包含 amount 参数', () => {
      const source = read('src/components/EarningsTransferModal.tsx')
      expect(source).toMatch(/onSuccess.*amount.*number/)
    })

    it('EarningsTransferModal.tsx 调用 onSuccess 时传入实际金额', () => {
      const source = read('src/components/EarningsTransferModal.tsx')
      expect(source).toContain('onSuccess(numAmount)')
    })
  })

  describe('14. CheckoutDialog 余额不足提示区', () => {
    it('CheckoutDialog.tsx 包含 shortage 可选参数', () => {
      const source = read('src/components/checkout/CheckoutDialog.tsx')
      expect(source).toContain('shortage')
    })

    it('CheckoutDialog.tsx 包含 earningsAvailable 可选参数', () => {
      const source = read('src/components/checkout/CheckoutDialog.tsx')
      expect(source).toContain('earningsAvailable')
    })

    it('CheckoutDialog.tsx 包含"购物余额不足，还差"提示文案', () => {
      const source = read('src/components/checkout/CheckoutDialog.tsx')
      expect(source).toContain('购物余额不足')
      expect(source).toContain('还差')
    })

    it('CheckoutDialog.tsx 包含"收益转入余额"按钮', () => {
      const source = read('src/components/checkout/CheckoutDialog.tsx')
      expect(source).toContain('收益转入余额')
    })

    it('CheckoutDialog.tsx 包含 onOpenEarningsTransfer 回调', () => {
      const source = read('src/components/checkout/CheckoutDialog.tsx')
      expect(source).toContain('onOpenEarningsTransfer')
    })

    it('CheckoutDialog.tsx 包含 onGoRecharge 回调', () => {
      const source = read('src/components/checkout/CheckoutDialog.tsx')
      expect(source).toContain('onGoRecharge')
    })
  })

  // ---- 页面参数传递 ----

  describe('15. 页面参数从当前商品记录读取', () => {
    it('CheckoutDialog shortage 来自 currentShortage', () => {
      const source = read('src/app/cart/page.tsx')
      expect(source).toMatch(/shortage=\{currentShortage\}/)
    })

    it('CheckoutDialog hasPendingOrder 来自 currentPendingPayment', () => {
      const source = read('src/app/cart/page.tsx')
      expect(source).toMatch(/hasPendingOrder=\{.*currentPendingPayment/)
    })

    it('EarningsTransferModal initialAmount 来自 currentShortage', () => {
      const source = read('src/app/cart/page.tsx')
      expect(source).toMatch(/initialAmount=\{Math\.min\(currentShortage/)
    })
  })
})
