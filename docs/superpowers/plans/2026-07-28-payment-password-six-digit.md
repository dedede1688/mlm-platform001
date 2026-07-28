# 支付密码回归6位数字与存量兼容 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` and execute this plan task-by-task. Every production change must be preceded by a test that is observed failing for the expected reason.

**Goal:** 新设置和修改后的支付密码统一为恰好6位数字，同时保证旧6位数字密码与存量字母数字密码都能继续完成订单支付、提现和旧密码验证。

**Architecture:** 把“新支付密码格式”从包含 Prisma、bcrypt 和锁定逻辑的认证模块中拆到纯策略模块；设置/修改入口使用6位数字策略，支付/提现/旧密码验证入口只做原始输入非空检查并继续使用现有 bcrypt 哈希比对。数据库、支付事务和5次错误锁定15分钟机制保持不变。

**Tech Stack:** Next.js 15 App Router、TypeScript、React 19、Vitest 4、bcryptjs、Prisma 6、Tailwind CSS。

## Global Constraints

- 业务基线提交：`61b4b6eca1d752d0485707528d27d77a375765fb`。
- 设计基线：`docs/superpowers/specs/2026-07-28-payment-password-six-digit-design.md`。
- 新设置和修改后的支付密码必须恰好为6位 ASCII 数字。
- 支付、提现和旧密码验证只检查原始输入非空，不得检查新密码格式。
- 存量字母数字密码和旧6位数字密码都必须继续由 bcrypt 哈希比对验证。
- 连续错误5次锁定15分钟的行为不得改变。
- 不修改 Prisma Schema、migration、数据库数据、资金计算、订单状态机、库存、积分、奖励、分红或通知。
- 不新增依赖。
- 小猫不得 `git add`、commit、push、部署或执行数据库写入。
- 不得修改或删除任务开始前已经存在的 `temp-s13d.js`。
- 每个 TDD 循环必须记录 RED 命令、预期失败原因、GREEN 命令和通过结果。

---

## File Map

### 新增

- `src/lib/validations/payment-password-policy.ts`：纯支付密码策略，不依赖 Prisma、bcrypt 或浏览器对象。
- `__tests__/lib/payment-password-policy.test.ts`：新密码格式与已有密码非空策略的单元测试。
- `__tests__/api/user/payment-password-routes.test.ts`：设置和修改支付密码API行为测试。

### 修改

- `src/lib/auth/payment-password.ts`：移除容易误用的新密码格式校验，只保留哈希、比对和锁定逻辑。
- `__tests__/lib/payment-password-lock.test.ts`：删除新密码格式测试，保留全部锁定测试。
- `src/app/api/user/payment-password/set/route.ts`：设置接口改用6位数字策略，清理未使用的格式schema。
- `src/app/api/user/payment-password/update/route.ts`：只对 `newPassword` 使用6位数字策略，`oldPassword` 继续原样哈希比对。
- `src/app/dashboard/payment-password/page.tsx`：新密码/确认密码限制为6位数字；当前密码保留字母输入能力。
- `src/components/checkout/CheckoutDialog.tsx`：已有支付密码只做非空检查。
- `src/components/dashboard/PaymentPasswordModal.tsx`：任意非空存量密码均可提交验证。
- `src/app/dashboard/withdrawals/page.tsx`：删除已有密码的格式拦截。
- `src/app/payment/order/[orderId]/page.tsx`：支付提示改为不误导存量用户的通用文案。

### 只读核对

- `src/app/api/orders/[id]/verify-payment/route.ts`
- `src/app/api/orders/[id]/route.ts`
- `src/app/api/withdrawals/route.ts`
- `src/lib/services/order-lifecycle.service.ts`

这些后端支付/提现验证入口当前已经是“非空检查 + bcrypt 比对”。若发现必须修改，停止并报告小酷，不得自行扩大范围。

---

### Task 1: 建立纯支付密码策略

**Files:**

- Create: `__tests__/lib/payment-password-policy.test.ts`
- Create: `src/lib/validations/payment-password-policy.ts`
- Modify: `__tests__/lib/payment-password-lock.test.ts`
- Modify: `src/lib/auth/payment-password.ts`

**Interfaces:**

- Produces:

```typescript
export const PAYMENT_PASSWORD_LENGTH: 6
export function isValidNewPaymentPassword(password: string): boolean
export function hasPaymentPasswordInput(password: string): boolean
```

- `isValidNewPaymentPassword` 仅供设置或修改后的新密码使用。
- `hasPaymentPasswordInput` 仅表达原始输入是否非空，不得 `trim()`，避免改变存量密码原文。

- [ ] **Step 1: 写策略失败测试**

新增 `__tests__/lib/payment-password-policy.test.ts`：

```typescript
import { describe, expect, it } from 'vitest'
import {
  PAYMENT_PASSWORD_LENGTH,
  hasPaymentPasswordInput,
  isValidNewPaymentPassword,
} from '@/lib/validations/payment-password-policy'

describe('payment password policy', () => {
  it.each(['000000', '123456', '987654'])(
    'accepts exactly six ASCII digits as a new payment password: %s',
    (password) => {
      expect(isValidNewPaymentPassword(password)).toBe(true)
    }
  )

  it.each(['', '12345', '1234567', 'abc123', 'abcdef', '12 345', '１２３４５６'])(
    'rejects a non-six-ASCII-digit new payment password: %s',
    (password) => {
      expect(isValidNewPaymentPassword(password)).toBe(false)
    }
  )

  it.each(['123456', 'abc123', ' abc123 '])(
    'allows any non-empty existing payment password to reach hash verification: %s',
    (password) => {
      expect(hasPaymentPasswordInput(password)).toBe(true)
    }
  )

  it('rejects only an empty existing payment password input', () => {
    expect(hasPaymentPasswordInput('')).toBe(false)
  })

  it('declares the six-digit input length once', () => {
    expect(PAYMENT_PASSWORD_LENGTH).toBe(6)
  })
})
```

测试要防住的回归：

- 把新密码重新改成字母数字混合；
- 把已有密码验证重新限制成6位数字；
- 对旧密码 `trim()` 后再验证，改变原始密码。

- [ ] **Step 2: 运行测试并确认 RED**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run __tests__\lib\payment-password-policy.test.ts
```

Expected: FAIL，因为 `@/lib/validations/payment-password-policy` 尚不存在。若测试意外通过，停止并检查路径和缓存。

- [ ] **Step 3: 写最小策略实现**

新增 `src/lib/validations/payment-password-policy.ts`：

```typescript
export const PAYMENT_PASSWORD_LENGTH = 6 as const

export function isValidNewPaymentPassword(password: string): boolean {
  return /^\d{6}$/.test(password)
}

export function hasPaymentPasswordInput(password: string): boolean {
  return password.length > 0
}
```

- [ ] **Step 4: 将格式测试从认证锁定测试中拆出**

在 `__tests__/lib/payment-password-lock.test.ts`：

- 从 `@/lib/auth/payment-password` 导入中删除 `isValidPaymentPassword`。
- 删除整个 `describe('isValidPaymentPassword', ...)`。
- 保留锁定、原子递增、解锁和常量测试不变。

在 `src/lib/auth/payment-password.ts`：

- 删除 `isValidPaymentPassword` 导出。
- 不改 `hashPaymentPassword`、`verifyPaymentPassword` 和全部锁定函数。

- [ ] **Step 5: 运行策略和锁定测试并确认 GREEN**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run __tests__\lib\payment-password-policy.test.ts __tests__\lib\payment-password-lock.test.ts
```

Expected: 两个测试文件全部 PASS；锁定阈值仍为5，持续时间仍为15分钟。

- [ ] **Step 6: 检查本任务差异**

Run:

```powershell
git diff -- src/lib/validations/payment-password-policy.ts src/lib/auth/payment-password.ts __tests__/lib/payment-password-policy.test.ts __tests__/lib/payment-password-lock.test.ts
```

Expected: 只有策略拆分和对应测试变化。记录检查结果，不暂存、不提交。

---

### Task 2: 设置/修改API只校验新密码

**Files:**

- Create: `__tests__/api/user/payment-password-routes.test.ts`
- Modify: `src/app/api/user/payment-password/set/route.ts`
- Modify: `src/app/api/user/payment-password/update/route.ts`

**Consumes:**

```typescript
isValidNewPaymentPassword(password: string): boolean
```

**Behavior:**

- 设置接口的 `password` 必须为6位数字。
- 修改接口的 `newPassword` 必须为6位数字。
- 修改接口的 `oldPassword` 可为任意非空存量密码并原样传给 bcrypt 比对。
- 现有锁定检查、失败累计、成功清零和哈希保存不变。

- [ ] **Step 1: 写API失败测试基础**

新增 `__tests__/api/user/payment-password-routes.test.ts`，使用项目现有 hoisted mock 模式：

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  getPaymentPasswordHash: vi.fn(),
  setPaymentPasswordHash: vi.fn(),
  hashPaymentPassword: vi.fn(),
  verifyPaymentPassword: vi.fn(),
  checkPaymentPasswordLock: vi.fn(),
  incrementFailedAttempt: vi.fn(),
  resetPaymentPasswordLock: vi.fn(),
}))

vi.mock('@/lib/utils/auth', () => ({ verifyToken: mocks.verifyToken }))
vi.mock('@/lib/services/user.service', () => ({
  UserService: {
    getPaymentPasswordHash: mocks.getPaymentPasswordHash,
    setPaymentPasswordHash: mocks.setPaymentPasswordHash,
  },
}))
vi.mock('@/lib/auth/payment-password', () => ({
  hashPaymentPassword: mocks.hashPaymentPassword,
  verifyPaymentPassword: mocks.verifyPaymentPassword,
  checkPaymentPasswordLock: mocks.checkPaymentPasswordLock,
  incrementFailedAttempt: mocks.incrementFailedAttempt,
  resetPaymentPasswordLock: mocks.resetPaymentPasswordLock,
  PAYMENT_LOCK_THRESHOLD: 5,
}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

function makeRequest(url: string, method: 'POST' | 'PUT', body: Record<string, unknown>) {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any
}

describe('payment password set/update routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.verifyToken.mockResolvedValue({ userId: 'user-1' })
    mocks.checkPaymentPasswordLock.mockResolvedValue({ locked: false })
    mocks.incrementFailedAttempt.mockResolvedValue({ attempts: 1, locked: false })
    mocks.resetPaymentPasswordLock.mockResolvedValue(undefined)
    mocks.hashPaymentPassword.mockResolvedValue('new-hash')
    mocks.setPaymentPasswordHash.mockResolvedValue(undefined)
  })

  it('sets an exactly six-digit payment password', async () => {
    mocks.getPaymentPasswordHash.mockResolvedValue(null)
    const { POST } = await import('@/app/api/user/payment-password/set/route')
    const response = await POST(
      makeRequest('http://localhost/api/user/payment-password/set', 'POST', { password: '123456' })
    )

    expect(response.status).toBe(200)
    expect(mocks.hashPaymentPassword).toHaveBeenCalledWith('123456')
    expect(mocks.setPaymentPasswordHash).toHaveBeenCalledWith('user-1', 'new-hash')
  })

  it.each(['abc123', '12345', '1234567'])(
    'rejects an invalid new payment password: %s',
    async (password) => {
      mocks.getPaymentPasswordHash.mockResolvedValue(null)
      const { POST } = await import('@/app/api/user/payment-password/set/route')
      const response = await POST(
        makeRequest('http://localhost/api/user/payment-password/set', 'POST', { password })
      )

      expect(response.status).toBe(400)
      expect(mocks.hashPaymentPassword).not.toHaveBeenCalled()
      expect(mocks.setPaymentPasswordHash).not.toHaveBeenCalled()
    }
  )

  it('accepts an alphanumeric legacy old password while requiring a six-digit new password', async () => {
    mocks.getPaymentPasswordHash.mockResolvedValue('old-hash')
    mocks.verifyPaymentPassword.mockResolvedValue(true)
    const { PUT } = await import('@/app/api/user/payment-password/update/route')
    const response = await PUT(
      makeRequest('http://localhost/api/user/payment-password/update', 'PUT', {
        oldPassword: 'legacyA1',
        newPassword: '654321',
      })
    )

    expect(response.status).toBe(200)
    expect(mocks.verifyPaymentPassword).toHaveBeenCalledWith('legacyA1', 'old-hash')
    expect(mocks.hashPaymentPassword).toHaveBeenCalledWith('654321')
    expect(mocks.resetPaymentPasswordLock).toHaveBeenCalledWith('user-1')
  })

  it('rejects an alphanumeric new password without verifying or saving it', async () => {
    const { PUT } = await import('@/app/api/user/payment-password/update/route')
    const response = await PUT(
      makeRequest('http://localhost/api/user/payment-password/update', 'PUT', {
        oldPassword: 'legacyA1',
        newPassword: 'newA12',
      })
    )

    expect(response.status).toBe(400)
    expect(mocks.verifyPaymentPassword).not.toHaveBeenCalled()
    expect(mocks.setPaymentPasswordHash).not.toHaveBeenCalled()
  })
})
```

不得断言哈希 mock 自身“正确加密”；这些测试验证路由的真实状态码和输入分流，bcrypt 算法由现有认证模块负责。

- [ ] **Step 2: 运行API测试并确认 RED**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run __tests__\api\user\payment-password-routes.test.ts
```

Expected:

- `123456` 设置场景 FAIL（当前规则拒绝纯数字）；
- `abc123` 拒绝场景 FAIL（当前规则接受字母数字混合）；
- 存量旧密码 + 6位新密码修改场景 FAIL。

确认失败来自旧业务规则，不是 mock 或导入错误。

- [ ] **Step 3: 更新设置接口**

在 `src/app/api/user/payment-password/set/route.ts`：

```typescript
import { hashPaymentPassword } from '@/lib/auth/payment-password'
import { isValidNewPaymentPassword } from '@/lib/validations/payment-password-policy'
```

格式分支改为：

```typescript
if (!password || !isValidNewPaymentPassword(password)) {
  return errorResponse('支付密码必须为6位数字', 400)
}
```

删除当前未被执行路径使用的：

- `z` 导入；
- `parseBody` 导入；
- `setPaymentPasswordSchema`。

不得改动“已存在支付密码”的检查、哈希和保存顺序。

- [ ] **Step 4: 更新修改接口**

在 `src/app/api/user/payment-password/update/route.ts`：

```typescript
import {
  hashPaymentPassword,
  verifyPaymentPassword,
  checkPaymentPasswordLock,
  incrementFailedAttempt,
  resetPaymentPasswordLock,
  PAYMENT_LOCK_THRESHOLD,
} from '@/lib/auth/payment-password'
import { isValidNewPaymentPassword } from '@/lib/validations/payment-password-policy'
```

只修改新密码格式分支：

```typescript
if (!isValidNewPaymentPassword(newPassword)) {
  return errorResponse('支付密码必须为6位数字', 400)
}
```

删除当前未被执行路径使用的：

- `z` 导入；
- `parseBody` 导入；
- `updatePaymentPasswordSchema`。

`oldPassword` 必须保持：

```text
非空检查 → 锁定检查 → verifyPaymentPassword(oldPassword, currentHash)
```

不得对 `oldPassword` 调用新密码格式校验或做字符过滤。

- [ ] **Step 5: 运行API、策略和锁定测试并确认 GREEN**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run __tests__\api\user\payment-password-routes.test.ts __tests__\lib\payment-password-policy.test.ts __tests__\lib\payment-password-lock.test.ts
```

Expected: 全部 PASS。

- [ ] **Step 6: 做锁定回归**

本批不修改锁定算法，不为未改变的实现制造假 RED。运行现有锁定测试，并结合新增修改成功测试确认：

- 锁定阈值仍是5；
- 锁定持续时间仍是15分钟；
- 正确旧密码时仍调用 `resetPaymentPasswordLock`；
- 旧密码原文未经格式转换就进入 `verifyPaymentPassword`。

Run:

```powershell
.\node_modules\.bin\vitest.cmd run __tests__\lib\payment-password-lock.test.ts __tests__\api\user\payment-password-routes.test.ts
```

Expected: 全部 PASS。

- [ ] **Step 7: 检查本任务差异**

Run:

```powershell
git diff -- src/app/api/user/payment-password/set/route.ts src/app/api/user/payment-password/update/route.ts __tests__/api/user/payment-password-routes.test.ts
```

Expected: 只有新密码规则、死格式schema清理和直接相关测试。记录结果，不暂存、不提交。

---

### Task 3: 前端设置页与已有密码验证入口解耦

**Files:**

- Modify: `src/app/dashboard/payment-password/page.tsx`
- Modify: `src/components/checkout/CheckoutDialog.tsx`
- Modify: `src/components/dashboard/PaymentPasswordModal.tsx`
- Modify: `src/app/dashboard/withdrawals/page.tsx`
- Modify: `src/app/payment/order/[orderId]/page.tsx`

**Consumes:**

```typescript
PAYMENT_PASSWORD_LENGTH
isValidNewPaymentPassword(password: string): boolean
hasPaymentPasswordInput(password: string): boolean
```

- [ ] **Step 1: 扩展策略测试，定义输入行为**

在 `__tests__/lib/payment-password-policy.test.ts` 确认以下行为已经由失败测试覆盖：

```typescript
expect(isValidNewPaymentPassword('123456')).toBe(true)
expect(isValidNewPaymentPassword('abc123')).toBe(false)
expect(hasPaymentPasswordInput('123456')).toBe(true)
expect(hasPaymentPasswordInput('abc123')).toBe(true)
expect(hasPaymentPasswordInput('')).toBe(false)
```

如果这些测试在 Task 1 已存在且已观察 RED，不重复写 change-detector 测试。记录它们保护的具体回归。

- [ ] **Step 2: 修改支付密码设置页面**

在 `src/app/dashboard/payment-password/page.tsx`：

```typescript
import {
  PAYMENT_PASSWORD_LENGTH,
  isValidNewPaymentPassword,
} from '@/lib/validations/payment-password-policy'
```

替换本地字母数字正则：

```typescript
const isValidPwd = isValidNewPaymentPassword
```

当前密码输入保持原样输入，不过滤非数字：

```typescript
onChange={(e) => setOldPassword(e.target.value.slice(0, 20))}
```

新密码和确认密码输入改为：

```typescript
onChange={(e) =>
  setNewPassword(e.target.value.replace(/\D/g, '').slice(0, PAYMENT_PASSWORD_LENGTH))
}
inputMode="numeric"
maxLength={PAYMENT_PASSWORD_LENGTH}
placeholder="请输入6位数字支付密码"
```

确认密码使用相同过滤和长度。全部提示统一为：

```text
支付密码必须为6位数字
```

修正旧注释，不得继续写与实现矛盾的规则。

- [ ] **Step 3: 修改共用结算弹窗**

在 `src/components/checkout/CheckoutDialog.tsx` 导入：

```typescript
import { hasPaymentPasswordInput } from '@/lib/validations/payment-password-policy'
```

把提交前字母数字正则替换为：

```typescript
if (!hasPaymentPasswordInput(payPassword)) {
  toast.error('请输入支付密码')
  return
}
```

输入框必须继续原样保留最多20字符，不得过滤字母：

```typescript
onChange={(e) => setPayPassword(e.target.value.slice(0, 20))}
placeholder="请输入支付密码"
maxLength={20}
```

- [ ] **Step 4: 修改订单支付密码弹窗**

在 `src/components/dashboard/PaymentPasswordModal.tsx`：

```typescript
import { hasPaymentPasswordInput } from '@/lib/validations/payment-password-policy'
```

替换：

```typescript
const isValid = hasPaymentPasswordInput(password)
```

保留原样字符输入和 `maxLength={20}`，占位文案改成“请输入支付密码”。按钮只在空输入或 loading 时禁用。

- [ ] **Step 5: 修改提现页面**

`src/app/dashboard/withdrawals/page.tsx` 已有空输入分支：

```typescript
if (!paymentPassword) {
  toast.error('请输入支付密码')
  return
}
```

删除紧随其后的字母数字正则分支，不得替换成6位数字正则。输入框继续允许字母，placeholder 改为“请输入支付密码”。

- [ ] **Step 6: 修正独立支付页文案**

在 `src/app/payment/order/[orderId]/page.tsx`：

```typescript
const password = window.prompt('请输入支付密码')
```

不得在此增加格式校验；非空后原样发给 `/api/orders/[id]/verify-payment`。

- [ ] **Step 7: 运行针对性测试和静态调用检查**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run __tests__\lib\payment-password-policy.test.ts __tests__\api\user\payment-password-routes.test.ts __tests__\components\payment-password-reset-flow.test.ts __tests__\components\checkout-pending-order-lock.test.ts __tests__\api\orders\verify-payment-route.test.ts
```

Expected: 全部 PASS。

Run:

```powershell
rg -n -F '(?=.*[a-zA-Z])(?=.*\d).{6,}' src
rg -n -F "isValidPaymentPassword" src __tests__
rg -n -S "支付密码.*字母|字母.*数字|至少6位" src
```

Expected:

- 旧字母数字正则0处；
- 模糊旧函数名0处；
- 面向支付密码的旧字母数字提示0处。

如果 `rg` 命中不属于支付密码的登录密码规则，逐条报告，不得误改登录密码。

- [ ] **Step 8: 只读核对真实后端验证入口**

Run:

```powershell
rg -n "verifyPaymentPassword|isValidNewPaymentPassword|hasPaymentPasswordInput" src/app/api/orders src/app/api/withdrawals src/lib/services/order-lifecycle.service.ts
```

Expected:

- 订单和提现后端验证仍调用 `verifyPaymentPassword`；
- 不调用 `isValidNewPaymentPassword`；
- 格式策略没有进入资金状态机。

发现不符时停止并报告小酷，不修改只读范围。

- [ ] **Step 9: 检查本任务差异**

Run:

```powershell
git diff -- src/app/dashboard/payment-password/page.tsx src/components/checkout/CheckoutDialog.tsx src/components/dashboard/PaymentPasswordModal.tsx src/app/dashboard/withdrawals/page.tsx ":(literal)src/app/payment/order/[orderId]/page.tsx"
```

Expected: 只包含输入限制、验证分流和文案更新。记录结果，不暂存、不提交。

---

### Task 4: 全量回归与交付证据

**Files:**

- No production file changes unless an earlier authorized-file test reveals a direct regression.
- Result is reported in the response using the structure of `docs/roles/templates/result.md`; do not create a result file.

- [ ] **Step 1: 运行全部支付密码针对性测试**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run __tests__\lib\payment-password-policy.test.ts __tests__\lib\payment-password-lock.test.ts __tests__\api\user\payment-password-routes.test.ts __tests__\api\orders\verify-payment-route.test.ts __tests__\services\order-lifecycle.test.ts __tests__\services\withdrawal.test.ts __tests__\components\payment-password-reset-flow.test.ts __tests__\components\checkout-pending-order-lock.test.ts
```

Expected: 全部 PASS。

- [ ] **Step 2: 运行全量测试**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run
```

Expected: 0 failed。记录测试文件数和测试数。

- [ ] **Step 3: 运行类型检查**

Run:

```powershell
.\node_modules\.bin\tsc.cmd --noEmit --project tsconfig.typecheck.json
```

Expected: exit code 0，无 TypeScript 错误。

- [ ] **Step 4: 运行生产构建**

Run:

```powershell
.\node_modules\.bin\next.cmd build
```

Expected: exit code 0。任何现有警告必须如实记录，不能写成“完全无警告”。

- [ ] **Step 5: 运行格式和范围检查**

Run:

```powershell
git diff --check
git status --short
git diff --stat
git diff --name-only
```

Expected:

- `git diff --check` 无输出；
- 修改文件全部位于授权范围；
- `temp-s13d.js` 仍保持任务前的未跟踪状态；
- 没有暂存、commit 或 push。

- [ ] **Step 6: 启动本地开发服务器做UI检查**

Run:

```powershell
pnpm dev
```

检查：

- 支付密码设置页新密码和确认密码只允许6位数字；
- 当前密码仍允许输入字母；
- 结账、订单支付弹窗和提现页允许输入字母数字存量密码；
- 空输入仍不能提交；
- 页面提示不再要求字母和数字混合。

不得使用生产账号或写生产数据库。若登录/测试账号限制导致无法进入受保护页面：

- 如实报告限制；
- 提供源码级调用证据；
- 由胡子老师登录后完成真实截图与支付/提现验收。

- [ ] **Step 7: 输出结构化结果**

结果必须包含：

1. 最终结论：完成/部分完成/阻塞。
2. 实际修改文件和每个文件的目的。
3. TDD RED证据：命令、失败测试、为什么是预期失败。
4. GREEN及回归证据：针对性测试、全量测试、typecheck、build、diff check。
5. 调用链证据：新密码规则只在设置/修改；支付/提现只做非空 + bcrypt。
6. UI验证或登录限制。
7. Git状态：分支、HEAD、未跟踪文件、确认未暂存/未提交/未推送。
8. 按 P0/P1/P2 列出风险；没有问题也要明确写“未发现”。

不得声称部署完成，不得向胡子老师做最终交付；结果交回小酷审核。
