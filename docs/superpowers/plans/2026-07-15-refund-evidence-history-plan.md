# 退款凭证校验与多次申请历史实施计划

> **执行代理必读：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，按任务逐项执行。每个步骤使用复选框跟踪，禁止跳过失败测试和复审检查点。

**目标：** 对需要实物证据的退款原因强制上传图片，并让后台审核员在审核当前申请时查看同一订单历次退款申请的文字、图片、状态和管理员备注。

**架构：** 使用一个无副作用的共享校验模块统一用户页面和退款接口的业务规则；后台继续复用现有 `GET /api/orders/[orderId]/refund` 获取按时间倒序排列的全部申请，并用独立历史组件展示。现有退款金额、状态流转、资金退回、通知和数据库结构保持不变。

**技术栈：** Next.js App Router、React、TypeScript、Prisma、Tailwind CSS、Vitest、React `renderToStaticMarkup`。

## 全局约束

- 不修改 `prisma/schema.prisma`，不新增或执行数据库迁移。
- 不修改退款金额计算、审核状态流转、退款完成、资金退回和通知链路。
- 不新增生产依赖，不修改 Vitest、TypeScript、Next.js 或 ESLint 配置。
- 用户端和后台接口都必须保留现有 Bearer Token（令牌）鉴权方式。
- 所有新校验必须先写失败测试，再写最小实现。
- 后端校验失败时不得创建 `RefundRequest`、不得写操作日志、不得发送通知。
- 质量问题、商品损坏至少上传 1 张图片；其他原因必须填写非空补充说明；每次最多 5 张图片。
- 审核拒绝时管理员备注去除首尾空格后至少 5 个字符；审核通过备注可选。
- 重新申请不继承任何旧图片或文字。
- 实施阶段只允许修改本计划列出的文件；不得使用 `git add .`。

---

## 文件结构

### 新建文件

- `src/lib/refunds/refund-validation.ts`：共享退款申请结构化校验，输出规范化数据或中文错误。
- `src/components/admin/refunds/RefundApplicationHistory.tsx`：后台历次申请折叠展示和申请序号计算。
- `__tests__/lib/refund-validation.test.ts`：共享校验单元测试。
- `__tests__/components/refund-application-page.test.ts`：用户退款页接线与动态提示契约测试。
- `__tests__/components/refund-application-history.test.ts`：后台历史组件真实 JSX 渲染测试。
- `__tests__/api/admin/refunds/review-route.test.ts`：后台审核拒绝原因接口测试。

### 修改文件

- `src/app/dashboard/orders/[id]/refund/page.tsx`：接入共享校验，增加动态必填提示。
- `src/app/api/orders/[id]/refund/route.ts`：接入共享校验并使用规范化请求数据。
- `src/app/admin/refunds/page.tsx`：加载历史、显示申请序号、处理加载状态并接入历史组件。
- `src/app/api/admin/refunds/[id]/review/route.ts`：增加拒绝原因最少 5 字校验。
- `__tests__/api/orders/refund-route.test.ts`：补退款申请后端校验和回归测试。

---

### 任务 1：建立共享退款申请校验

**文件：**
- 新建：`src/lib/refunds/refund-validation.ts`
- 新建：`__tests__/lib/refund-validation.test.ts`

**接口：**
- 输入：`validateRefundApplication(input: RefundApplicationInput)`
- 输出：`{ success: true; data: NormalizedRefundApplication } | { success: false; error: string }`
- 后续依赖：任务 2 的 API 路由和任务 3 的用户页面均调用此函数。

- [ ] **步骤 1：先写共享校验失败测试**

在 `__tests__/lib/refund-validation.test.ts` 写入以下测试：

```ts
import { describe, expect, it } from 'vitest'
import { validateRefundApplication } from '@/lib/refunds/refund-validation'

describe('validateRefundApplication', () => {
  it.each(['质量问题', '商品损坏'])('%s 无图时拒绝', reason => {
    expect(validateRefundApplication({ reason, description: '', images: [] })).toEqual({
      success: false,
      error: '该退款原因至少需要上传1张凭证图片',
    })
  })

  it('质量问题有1张图片时通过并保留图片', () => {
    expect(validateRefundApplication({
      reason: '质量问题',
      description: '  瓶身破损  ',
      images: ['https://example.com/evidence.jpg'],
    })).toEqual({
      success: true,
      data: {
        reason: '质量问题',
        description: '瓶身破损',
        images: ['https://example.com/evidence.jpg'],
      },
    })
  })

  it('其他原因无补充说明时拒绝', () => {
    expect(validateRefundApplication({ reason: '其他', description: '   ', images: [] })).toEqual({
      success: false,
      error: '选择其他原因时请填写补充说明',
    })
  })

  it('未按约定时间发货无图无说明时通过', () => {
    expect(validateRefundApplication({
      reason: '未按约定时间发货',
      description: undefined,
      images: undefined,
    })).toEqual({
      success: true,
      data: {
        reason: '未按约定时间发货',
        description: null,
        images: [],
      },
    })
  })
})
```

同一文件添加以下非法输入场景：

```ts
it.each([
  { images: 'url', error: '凭证图片格式不正确' },
  { images: [123], error: '凭证图片格式不正确' },
  { images: [''], error: '凭证图片不能为空' },
  { images: ['1', '2', '3', '4', '5', '6'], error: '凭证图片最多上传5张' },
])('拒绝非法图片输入 %#', ({ images, error }) => {
  expect(validateRefundApplication({ reason: '未按约定时间发货', images })).toEqual({
    success: false,
    error,
  })
})
```

- [ ] **步骤 2：运行测试并确认因模块不存在而失败**

运行：

```powershell
npx vitest run __tests__/lib/refund-validation.test.ts
```

预期：失败，错误包含 `Failed to resolve import '@/lib/refunds/refund-validation'`。

- [ ] **步骤 3：实现最小共享校验模块**

新建 `src/lib/refunds/refund-validation.ts`：

```ts
export const REFUND_REASONS_REQUIRING_IMAGES = new Set(['质量问题', '商品损坏'])

export interface RefundApplicationInput {
  reason: unknown
  description?: unknown
  images?: unknown
}

export interface NormalizedRefundApplication {
  reason: string
  description: string | null
  images: string[]
}

export type RefundApplicationValidationResult =
  | { success: true; data: NormalizedRefundApplication }
  | { success: false; error: string }

export function refundReasonRequiresImages(reason: string): boolean {
  return REFUND_REASONS_REQUIRING_IMAGES.has(reason)
}

export function refundReasonRequiresDescription(reason: string): boolean {
  return reason === '其他'
}

export function validateRefundApplication(
  input: RefundApplicationInput
): RefundApplicationValidationResult {
  if (typeof input.reason !== 'string' || !input.reason.trim()) {
    return { success: false, error: '退款原因不能为空' }
  }

  if (input.description !== undefined && typeof input.description !== 'string') {
    return { success: false, error: '补充说明格式不正确' }
  }

  if (input.images !== undefined && !Array.isArray(input.images)) {
    return { success: false, error: '凭证图片格式不正确' }
  }

  const images = input.images === undefined ? [] : input.images
  if (!images.every((image): image is string => typeof image === 'string')) {
    return { success: false, error: '凭证图片格式不正确' }
  }
  if (images.some(image => !image.trim())) {
    return { success: false, error: '凭证图片不能为空' }
  }
  if (images.length > 5) {
    return { success: false, error: '凭证图片最多上传5张' }
  }

  const reason = input.reason.trim()
  const description = typeof input.description === 'string'
    ? input.description.trim()
    : ''

  if (refundReasonRequiresImages(reason) && images.length === 0) {
    return { success: false, error: '该退款原因至少需要上传1张凭证图片' }
  }
  if (refundReasonRequiresDescription(reason) && !description) {
    return { success: false, error: '选择其他原因时请填写补充说明' }
  }

  return {
    success: true,
    data: {
      reason,
      description: description || null,
      images: images.map(image => image.trim()),
    },
  }
}
```

- [ ] **步骤 4：运行共享校验测试并确认通过**

运行：

```powershell
npx vitest run __tests__/lib/refund-validation.test.ts
```

预期：测试文件全部通过，0 个失败。

- [ ] **步骤 5：创建本地检查点提交**

```powershell
git add -- src/lib/refunds/refund-validation.ts __tests__/lib/refund-validation.test.ts
git commit -m "feat(refunds): add shared application validation"
```

---

### 任务 2：在退款申请接口强制执行结构化校验

**文件：**
- 修改：`src/app/api/orders/[id]/refund/route.ts`
- 修改：`__tests__/api/orders/refund-route.test.ts`

**接口：**
- 消费：任务 1 的 `validateRefundApplication()`。
- 保持：`POST /api/orders/[id]/refund` 成功响应和通知调用不变。

- [ ] **步骤 1：扩展路由测试，先证明当前接口可以绕过校验**

在 `__tests__/api/orders/refund-route.test.ts` 中导入通知 mock，并为成功前置建立辅助函数：

```ts
import { OrderNotificationService } from '@/lib/services/order-notification.service'

// 将原 beforeEach 改为 reset，避免失败校验未消费的 mockResolvedValueOnce 串到下一测试。
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(OrderNotificationService.notifyRefundSubmitted).mockResolvedValue(undefined)
})

function mockRefundableOrder(userId = 'user-1', orderId = 'order-1') {
  vi.mocked(verifyToken).mockResolvedValueOnce({ userId } as any)
  prisma.order.findUnique.mockResolvedValueOnce({
    id: orderId, userId, status: 'paid', payAmount: 500,
  })
  prisma.refundRequest.findFirst.mockResolvedValueOnce(null)
}
```

增加以下失败测试：

```ts
it.each(['质量问题', '商品损坏'])('%s 无图片返回400且无副作用', async reason => {
  mockRefundableOrder()
  const { POST } = await import('@/app/api/orders/[id]/refund/route')
  const res = await POST(makePostRequest({ reason, images: [] }), makeParams('order-1'))
  expect(res.status).toBe(400)
  expect((await res.json()).error).toBe('该退款原因至少需要上传1张凭证图片')
  expect(prisma.refundRequest.create).not.toHaveBeenCalled()
  expect(OrderNotificationService.notifyRefundSubmitted).not.toHaveBeenCalled()
})

it('其他原因无补充说明返回400且无副作用', async () => {
  mockRefundableOrder()
  const { POST } = await import('@/app/api/orders/[id]/refund/route')
  const res = await POST(makePostRequest({ reason: '其他', description: '  ' }), makeParams('order-1'))
  expect(res.status).toBe(400)
  expect(prisma.refundRequest.create).not.toHaveBeenCalled()
  expect(OrderNotificationService.notifyRefundSubmitted).not.toHaveBeenCalled()
})
```

添加图片结构和成功路径测试：

```ts
it.each([
  { images: 'https://example.com/a.jpg', error: '凭证图片格式不正确' },
  { images: [123], error: '凭证图片格式不正确' },
  { images: [''], error: '凭证图片不能为空' },
  { images: ['1', '2', '3', '4', '5', '6'], error: '凭证图片最多上传5张' },
])('非法图片输入返回400且无副作用 %#', async ({ images, error }) => {
  mockRefundableOrder()
  const { POST } = await import('@/app/api/orders/[id]/refund/route')
  const res = await POST(
    makePostRequest({ reason: '未按约定时间发货', images }),
    makeParams('order-1')
  )
  expect(res.status).toBe(400)
  expect((await res.json()).error).toBe(error)
  expect(prisma.refundRequest.create).not.toHaveBeenCalled()
  expect(OrderNotificationService.notifyRefundSubmitted).not.toHaveBeenCalled()
})

it('未按约定时间发货无图可创建', async () => {
  mockRefundableOrder()
  prisma.refundRequest.create.mockResolvedValueOnce({
    id: 'refund-1', orderId: 'order-1', userId: 'user-1', amount: 500,
    reason: '未按约定时间发货', description: null, images: null, status: 'pending',
  })
  const { POST } = await import('@/app/api/orders/[id]/refund/route')
  const res = await POST(
    makePostRequest({ reason: '未按约定时间发货' }),
    makeParams('order-1')
  )
  expect(res.status).toBe(200)
  expect(prisma.refundRequest.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      reason: '未按约定时间发货',
      description: null,
      status: 'pending',
    }),
  })
})

it('质量问题有1张图片可创建且只保存本次图片', async () => {
  mockRefundableOrder()
  prisma.refundRequest.create.mockResolvedValueOnce({
    id: 'refund-2', orderId: 'order-1', userId: 'user-1', amount: 500,
    reason: '质量问题', description: null,
    images: ['https://example.com/new.jpg'], status: 'pending',
  })
  const { POST } = await import('@/app/api/orders/[id]/refund/route')
  const res = await POST(
    makePostRequest({ reason: '质量问题', images: ['https://example.com/new.jpg'] }),
    makeParams('order-1')
  )
  expect(res.status).toBe(200)
  expect(prisma.refundRequest.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      images: ['https://example.com/new.jpg'],
    }),
  })
})
```

- [ ] **步骤 2：运行路由测试并确认新增场景失败**

运行：

```powershell
npx vitest run __tests__/api/orders/refund-route.test.ts
```

预期：新增无图和“其他”无说明测试失败，现有防重复测试保持通过。

- [ ] **步骤 3：在接口中接入共享校验**

在 `src/app/api/orders/[id]/refund/route.ts` 导入：

```ts
import { validateRefundApplication } from '@/lib/refunds/refund-validation'
```

将当前请求体类型断言和仅校验 `reason` 的代码替换为：

```ts
const body = await request.json()
const validation = validateRefundApplication({
  reason: body?.reason,
  description: body?.description,
  images: body?.images,
})

if (!validation.success) {
  return NextResponse.json(
    { success: false, error: validation.error },
    { status: 400 }
  )
}

const normalized = validation.data
```

创建记录时只使用规范化数据：

```ts
const refundRequest = await prisma.refundRequest.create({
  data: {
    orderId,
    userId: user.userId,
    amount: order.payAmount,
    reason: normalized.reason,
    description: normalized.description,
    images: normalized.images.length > 0 ? normalized.images : Prisma.JsonNull,
    status: 'pending',
  },
})
```

不要移动订单归属、订单状态、防重复申请、通知和成功响应代码。

- [ ] **步骤 4：运行路由与共享校验回归测试**

运行：

```powershell
npx vitest run __tests__/lib/refund-validation.test.ts __tests__/api/orders/refund-route.test.ts
```

预期：全部通过；防重复 pending/approved 和 rejected 可重新申请测试继续通过。

- [ ] **步骤 5：创建本地检查点提交**

```powershell
git add -- "src/app/api/orders/[id]/refund/route.ts" __tests__/api/orders/refund-route.test.ts
git commit -m "fix(refunds): enforce application evidence rules"
```

---

### 任务 3：用户退款页增加动态必填提示和提交拦截

**文件：**
- 修改：`src/app/dashboard/orders/[id]/refund/page.tsx`
- 新建：`__tests__/components/refund-application-page.test.ts`

**接口：**
- 消费：任务 1 的 `validateRefundApplication()`、`refundReasonRequiresImages()` 和 `refundReasonRequiresDescription()`。
- 页面仍提交到 `POST /api/orders/[id]/refund`。

- [ ] **步骤 1：先写页面接线失败测试**

在 `__tests__/components/refund-application-page.test.ts` 读取页面源码并用括号平衡函数提取 `handleSubmit`，禁止固定字符窗口：

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(
  path.resolve(process.cwd(), 'src/app/dashboard/orders/[id]/refund/page.tsx'),
  'utf8'
)

function extractBracedBlock(input: string, marker: string): string {
  const markerIndex = input.indexOf(marker)
  expect(markerIndex).toBeGreaterThanOrEqual(0)
  const start = input.indexOf('{', markerIndex)
  expect(start).toBeGreaterThan(markerIndex)
  let depth = 0
  for (let index = start; index < input.length; index += 1) {
    if (input[index] === '{') depth += 1
    if (input[index] === '}') depth -= 1
    if (depth === 0) return input.slice(start, index + 1)
  }
  throw new Error(`未找到 ${marker} 的完整函数体`)
}

describe('退款申请页面凭证规则', () => {
  it('handleSubmit 在 fetch 前执行共享校验并在失败时 return', () => {
    const block = extractBracedBlock(source, 'const handleSubmit')
    expect(block).toContain('validateRefundApplication')
    expect(block.indexOf('validateRefundApplication')).toBeLessThan(block.indexOf('fetch('))
    expect(block).toContain('if (!validation.success)')
    expect(block).toContain('setError(validation.error)')
    expect(block).toMatch(/if \(!validation\.success\)[\s\S]*?return/)
  })

  it('动态标记由共享规则函数驱动', () => {
    expect(source).toContain('refundReasonRequiresImages(form.reason)')
    expect(source).toContain('refundReasonRequiresDescription(form.reason)')
    expect(source).toContain('该退款原因至少需要上传1张凭证图片')
  })
})
```

- [ ] **步骤 2：运行页面测试并确认失败**

运行：

```powershell
npx vitest run __tests__/components/refund-application-page.test.ts
```

预期：失败，因为页面尚未导入或调用共享校验函数。

- [ ] **步骤 3：接入共享规则并更新提交逻辑**

在页面导入：

```ts
import {
  refundReasonRequiresDescription,
  refundReasonRequiresImages,
  validateRefundApplication,
} from '@/lib/refunds/refund-validation'
```

在组件内计算：

```ts
const imagesRequired = refundReasonRequiresImages(form.reason)
const descriptionRequired = refundReasonRequiresDescription(form.reason)
```

在 `handleSubmit` 的 `setSubmitting(true)` 之前加入：

```ts
const validation = validateRefundApplication(form)
if (!validation.success) {
  setError(validation.error)
  return
}
```

请求体使用 `validation.data`：

```ts
body: JSON.stringify({
  reason: validation.data.reason,
  description: validation.data.description || undefined,
  images: validation.data.images.length > 0 ? validation.data.images : undefined,
}),
```

不要把任何历史退款数据写入 `form` 初始状态或 `useEffect`。

- [ ] **步骤 4：增加动态标签和提示**

补充说明标签改为：

```tsx
补充说明
{descriptionRequired && <span className="text-red-500 ml-1">*</span>}
```

上传凭证标签和提示改为：

```tsx
上传凭证
{imagesRequired && <span className="text-red-500 ml-1">*</span>}

{imagesRequired && (
  <p className="text-xs text-red-500 mb-2">
    该退款原因至少需要上传1张凭证图片
  </p>
)}
<p className="text-xs text-gray-400 mb-3">
  最多上传5张图片，支持 JPG、PNG，单张最大5MB
</p>
```

原因切换时只清理 `error`，保留用户本次已经上传的图片。

- [ ] **步骤 5：运行页面、共享校验和接口测试**

运行：

```powershell
npx vitest run __tests__/components/refund-application-page.test.ts __tests__/lib/refund-validation.test.ts __tests__/api/orders/refund-route.test.ts
```

预期：全部通过，0 个失败。

- [ ] **步骤 6：创建本地检查点提交**

```powershell
git add -- "src/app/dashboard/orders/[id]/refund/page.tsx" __tests__/components/refund-application-page.test.ts
git commit -m "feat(refunds): require evidence for damage claims"
```

---

### 任务 4：后台审核接口强制拒绝原因

**文件：**
- 修改：`src/app/api/admin/refunds/[id]/review/route.ts`
- 新建：`__tests__/api/admin/refunds/review-route.test.ts`

**接口：**
- 输入：现有 `{ action: 'approve' | 'reject'; adminComment?: string }`。
- 输出：拒绝原因不足 5 字时返回 400，成功路径格式不变。

- [ ] **步骤 1：先写拒绝原因接口失败测试**

建立与路由真实依赖一致的 mock：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyPermission: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  logOperation: vi.fn(),
  notifyRefundReview: vi.fn(),
}))

vi.mock('@/lib/utils/admin-auth', () => ({
  verifyPermission: mocks.verifyPermission,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    refundRequest: {
      findUnique: mocks.findUnique,
      update: mocks.update,
    },
  },
}))
vi.mock('@/lib/utils/operation-log', () => ({
  logOperation: mocks.logOperation,
}))
vi.mock('@/lib/services/order-notification.service', () => ({
  OrderNotificationService: {
    notifyRefundReview: mocks.notifyRefundReview,
  },
}))

function makePatchRequest(body: Record<string, unknown>) {
  return {
    json: async () => body,
    headers: new Headers(),
  } as any
}

describe('PATCH /api/admin/refunds/[id]/review', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.verifyPermission.mockResolvedValue({
      user: { id: 'admin-1', role: 'finance_admin' },
      error: null,
    })
    mocks.findUnique.mockResolvedValue({
      id: 'refund-1', userId: 'user-1', status: 'pending',
    })
    mocks.update.mockResolvedValue({
      id: 'refund-1', userId: 'user-1', status: 'rejected',
      adminComment: '凭证无法证明问题',
    })
    mocks.logOperation.mockResolvedValue(undefined)
    mocks.notifyRefundReview.mockResolvedValue(undefined)
  })
```

在同一 `describe` 中增加：

```ts
it.each([undefined, '', '   ', '不足'])('拒绝原因 %j 不足5字时返回400且无副作用', async adminComment => {
  const { PATCH } = await import('@/app/api/admin/refunds/[id]/review/route')
  const response = await PATCH(
    makePatchRequest({ action: 'reject', adminComment }),
    { params: Promise.resolve({ id: 'refund-1' }) }
  )
  expect(response.status).toBe(400)
  expect(prisma.refundRequest.update).not.toHaveBeenCalled()
  expect(logOperation).not.toHaveBeenCalled()
  expect(OrderNotificationService.notifyRefundReview).not.toHaveBeenCalled()
})

it('拒绝原因满足5字时保留原审核流程', async () => {
  const { PATCH } = await import('@/app/api/admin/refunds/[id]/review/route')
  const response = await PATCH(
    makePatchRequest({ action: 'reject', adminComment: '  凭证无法证明问题  ' }),
    { params: Promise.resolve({ id: 'refund-1' }) }
  )
  expect(response.status).toBe(200)
  expect(mocks.update).toHaveBeenCalledWith({
    where: { id: 'refund-1' },
    data: { status: 'rejected', adminComment: '凭证无法证明问题' },
  })
  expect(mocks.logOperation).toHaveBeenCalledWith(
    expect.objectContaining({
      action: 'REJECT',
      newValue: { status: 'rejected', adminComment: '凭证无法证明问题' },
    })
  )
  expect(mocks.notifyRefundReview).toHaveBeenCalledWith(
    expect.objectContaining({
      action: 'reject',
      adminComment: '凭证无法证明问题',
    })
  )
})

it('通过审核时允许不填管理员备注', async () => {
  mocks.update.mockResolvedValueOnce({
    id: 'refund-1', userId: 'user-1', status: 'approved', adminComment: null,
  })
  const { PATCH } = await import('@/app/api/admin/refunds/[id]/review/route')
  const response = await PATCH(
    makePatchRequest({ action: 'approve' }),
    { params: Promise.resolve({ id: 'refund-1' }) }
  )
  expect(response.status).toBe(200)
  expect(mocks.update).toHaveBeenCalledWith({
    where: { id: 'refund-1' },
    data: { status: 'approved', adminComment: null },
  })
})
})
```

- [ ] **步骤 2：运行审核路由测试并确认拒绝原因场景失败**

运行：

```powershell
npx vitest run __tests__/api/admin/refunds/review-route.test.ts
```

预期：拒绝原因不足 5 字测试失败，因为当前路由仍执行 update。

- [ ] **步骤 3：在查询退款申请之前增加最小校验**

在 action 合法性校验之后加入：

```ts
const normalizedAdminComment = typeof adminComment === 'string'
  ? adminComment.trim()
  : ''

if (action === 'reject' && normalizedAdminComment.length < 5) {
  return NextResponse.json(
    { success: false, message: '拒绝原因至少填写5个字符' },
    { status: 400 }
  )
}
```

后续 `update`、`logOperation` 和通知统一使用：

```ts
const commentForStorage = normalizedAdminComment || null

const updated = await prisma.refundRequest.update({
  where: { id },
  data: {
    status: newStatus,
    adminComment: commentForStorage,
  },
})

await logOperation({
  userId: admin.id,
  action: action === 'approve' ? 'APPROVE' : 'REJECT',
  module: 'refund',
  targetId: id,
  newValue: { status: newStatus, adminComment: commentForStorage },
  ip: request.headers.get('x-forwarded-for') || undefined,
  userAgent: request.headers.get('user-agent') || undefined,
})

await OrderNotificationService.notifyRefundReview({
  userId: refundRequest.userId,
  refundId: id,
  action,
  adminComment: normalizedAdminComment || undefined,
  operatorId: admin.id,
})
```

通过审核时 `commentForStorage` 可以为 `null`；不要修改鉴权角色和 pending 状态校验。

- [ ] **步骤 4：运行审核路由测试并确认通过**

```powershell
npx vitest run __tests__/api/admin/refunds/review-route.test.ts
```

预期：全部通过，且失败路径 update/log/notification 调用次数为 0。

- [ ] **步骤 5：创建本地检查点提交**

```powershell
git add -- "src/app/api/admin/refunds/[id]/review/route.ts" __tests__/api/admin/refunds/review-route.test.ts
git commit -m "fix(refunds): require rejection reason"
```

---

### 任务 5：后台审核弹窗加载并展示历次申请

**文件：**
- 新建：`src/components/admin/refunds/RefundApplicationHistory.tsx`
- 新建：`__tests__/components/refund-application-history.test.ts`
- 修改：`src/app/admin/refunds/page.tsx`

**接口：**
- `RefundApplicationHistory` 接收 `records`、`currentRefundId` 和 `formatTime`。
- 后台页面调用现有 `GET /api/orders/[orderId]/refund`，请求必须携带 Bearer Token。
- 审核提交只在历史加载成功后启用。

- [ ] **步骤 1：先写申请序号和真实 JSX 渲染失败测试**

在 `__tests__/components/refund-application-history.test.ts` 中 mock `next/image`，真实导入并渲染组件：

```ts
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: any) => React.createElement('img', { src, alt, ...props }),
}))

import RefundApplicationHistory, {
  buildRefundAttemptView,
} from '@/components/admin/refunds/RefundApplicationHistory'

const records = [
  {
    id: 'refund-2', reason: '商品损坏', description: '第二次新凭证',
    images: ['https://example.com/second.jpg'], status: 'pending',
    adminComment: null, createdAt: '2026-07-15T10:00:00Z',
  },
  {
    id: 'refund-1', reason: '质量问题', description: '第一次凭证',
    images: ['https://example.com/first.jpg'], status: 'rejected',
    adminComment: '图片无法证明问题', createdAt: '2026-07-14T10:00:00Z',
  },
]

it('按真实时间顺序计算当前为第2次申请', () => {
  const view = buildRefundAttemptView(records, 'refund-2')
  expect(view.currentAttemptNumber).toBe(2)
  expect(view.previousRecords[0].attemptNumber).toBe(1)
})

it('历史区域显示第一次申请自己的文字图片状态和备注', () => {
  const html = renderToStaticMarkup(React.createElement(RefundApplicationHistory, {
    records,
    currentRefundId: 'refund-2',
    formatTime: (value: string) => value,
  }))
  expect(html).toContain('历史申请记录（共1次）')
  expect(html).toContain('第1次申请')
  expect(html).toContain('第一次凭证')
  expect(html).toContain('first.jpg')
  expect(html).toContain('图片无法证明问题')
  expect(html).not.toContain('second.jpg')
})
```

- [ ] **步骤 2：运行组件测试并确认模块不存在**

```powershell
npx vitest run __tests__/components/refund-application-history.test.ts
```

预期：失败，错误包含无法解析 `RefundApplicationHistory`。

- [ ] **步骤 3：实现历史组件和序号计算**

组件完整实现如下：

```tsx
'use client'

import Image from 'next/image'

export interface RefundHistoryRecord {
  id: string
  reason: string
  description: string | null
  images: unknown
  status: string
  adminComment: string | null
  createdAt: string
}

export function buildRefundAttemptView(records: RefundHistoryRecord[], currentRefundId: string) {
  const chronological = [...records].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  )
  const numbered = chronological.map((record, index) => ({
    ...record,
    attemptNumber: index + 1,
  }))
  return {
    currentAttemptNumber: numbered.find(record => record.id === currentRefundId)?.attemptNumber ?? 1,
    previousRecords: numbered
      .filter(record => record.id !== currentRefundId)
      .sort((left, right) => right.attemptNumber - left.attemptNumber),
  }
}

const STATUS_LABELS: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
  completed: '已完成',
}

function parseImages(images: unknown): string[] {
  return Array.isArray(images)
    ? images.filter((image): image is string => typeof image === 'string' && Boolean(image))
    : []
}

interface RefundApplicationHistoryProps {
  records: RefundHistoryRecord[]
  currentRefundId: string
  formatTime: (value: string) => string
}

export default function RefundApplicationHistory({
  records,
  currentRefundId,
  formatTime,
}: RefundApplicationHistoryProps) {
  const { previousRecords } = buildRefundAttemptView(records, currentRefundId)
  if (previousRecords.length === 0) return null

  return (
    <details className="rounded-lg border border-gray-200 bg-gray-50">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-800">
        历史申请记录（共{previousRecords.length}次）
      </summary>
      <div className="space-y-3 border-t border-gray-200 p-4">
        {previousRecords.map(record => {
          const images = parseImages(record.images)
          return (
            <section key={record.id} className="rounded-lg bg-white p-3 text-sm shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <strong>第{record.attemptNumber}次申请</strong>
                <span className="text-xs text-gray-500">{formatTime(record.createdAt)}</span>
              </div>
              <p className="mt-2"><span className="text-gray-500">状态：</span>{STATUS_LABELS[record.status] || record.status}</p>
              <p><span className="text-gray-500">退款原因：</span>{record.reason}</p>
              {record.description && (
                <p><span className="text-gray-500">补充说明：</span>{record.description}</p>
              )}
              {images.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {images.map((image, index) => (
                    <a key={`${record.id}-${image}-${index}`} href={image} target="_blank" rel="noopener noreferrer">
                      <Image
                        src={image}
                        alt={`第${record.attemptNumber}次申请凭证${index + 1}`}
                        width={64}
                        height={64}
                        className="h-16 w-16 rounded border border-gray-200 object-cover"
                      />
                    </a>
                  ))}
                </div>
              )}
              {record.adminComment && (
                <p className="mt-2 rounded bg-gray-50 p-2">
                  <span className="text-gray-500">管理员备注：</span>{record.adminComment}
                </p>
              )}
            </section>
          )
        })}
      </div>
    </details>
  )
}
```

该实现使用原生 `<details>` / `<summary>` 创建折叠区域；无历史记录时返回 `null`。图片来自每条历史记录自身，不能把当前申请图片合并进历史数组。

- [ ] **步骤 4：运行历史组件测试并确认通过**

```powershell
npx vitest run __tests__/components/refund-application-history.test.ts
```

预期：全部通过。

- [ ] **步骤 5：后台页面增加历史状态和加载函数**

在 `src/app/admin/refunds/page.tsx` 增加导入：

```ts
import { useState, useEffect, useCallback, useRef } from 'react'
import RefundApplicationHistory, {
  buildRefundAttemptView,
  type RefundHistoryRecord,
} from '@/components/admin/refunds/RefundApplicationHistory'
```

增加状态：

```ts
const [reviewHistory, setReviewHistory] = useState<RefundHistoryRecord[]>([])
const [reviewHistoryLoading, setReviewHistoryLoading] = useState(false)
const [reviewHistoryError, setReviewHistoryError] = useState('')
const reviewHistoryRequestRef = useRef(0)
```

增加统一关闭函数，防止状态串台：

```ts
const closeReviewModal = () => {
  reviewHistoryRequestRef.current += 1
  setReviewModal(null)
  setAdminComment('')
  setReviewHistory([])
  setReviewHistoryError('')
  setReviewHistoryLoading(false)
}
```

增加加载函数：

```ts
const fetchReviewHistory = async (item: RefundItem, authToken: string) => {
  const requestId = reviewHistoryRequestRef.current + 1
  reviewHistoryRequestRef.current = requestId
  setReviewHistoryLoading(true)
  setReviewHistoryError('')
  setReviewHistory([])
  try {
    const res = await fetch(`/api/orders/${item.orderId}/refund`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
    const data = await res.json()
    if (!res.ok || !data.success || !Array.isArray(data.data)) {
      throw new Error(data.error || '历史申请加载失败')
    }
    const records = data.data as RefundHistoryRecord[]
    if (!records.some(record => record.id === item.id)) {
      throw new Error('历史申请数据不完整')
    }
    if (reviewHistoryRequestRef.current !== requestId) return
    setReviewHistory(records)
  } catch (error) {
    if (reviewHistoryRequestRef.current !== requestId) return
    setReviewHistoryError(error instanceof Error ? error.message : '历史申请加载失败')
  } finally {
    if (reviewHistoryRequestRef.current === requestId) {
      setReviewHistoryLoading(false)
    }
  }
}
```

增加统一打开函数：

```ts
const openReviewModal = (item: RefundItem, action: 'approve' | 'reject') => {
  if (!token) return
  setReviewModal({ item, action })
  setAdminComment('')
  void fetchReviewHistory(item, token)
}
```

普通通过、拒绝和大额确认后的入口全部调用 `openReviewModal`，关闭按钮和取消按钮全部调用 `closeReviewModal`。

具体替换规则：

```ts
// 普通通过
openReviewModal(r, 'approve')

// 拒绝
openReviewModal(r, 'reject')

// 大额确认完成后
openReviewModal(largeRefundConfirm.item, largeRefundConfirm.action)
setLargeRefundConfirm(null)
```

- [ ] **步骤 6：在审核弹窗接入当前次数、历史、加载和错误状态**

在 `reviewModal` 分支计算：

```ts
const attemptView = buildRefundAttemptView(reviewHistory, reviewModal.item.id)
const rejectionReasonInvalid = reviewModal.action === 'reject'
  && adminComment.trim().length < 5
const reviewUnavailable = reviewHistoryLoading || Boolean(reviewHistoryError)
```

标题下方增加 `第 {attemptView.currentAttemptNumber} 次申请`；当前申请区域继续显示当前 `reviewModal.item` 的原因、说明、时间和图片。当前申请下方渲染：

```tsx
{reviewHistoryLoading && (
  <div className="flex items-center gap-2 text-sm text-gray-500">
    <Loader2 className="w-4 h-4 animate-spin" />
    正在加载历史申请
  </div>
)}

{reviewHistoryError && (
  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
    <p>{reviewHistoryError}</p>
    <button type="button" onClick={() => token && fetchReviewHistory(reviewModal.item, token)}>
      重新获取
    </button>
  </div>
)}

{!reviewHistoryLoading && !reviewHistoryError && (
  <RefundApplicationHistory
    records={reviewHistory}
    currentRefundId={reviewModal.item.id}
    formatTime={formatTime}
  />
)}
```

拒绝时 textarea 标签和占位符改为“拒绝原因（至少 5 个字符）”；不足 5 字显示红色提示。确认按钮禁用条件改为：

```tsx
disabled={reviewing || reviewUnavailable || rejectionReasonInvalid}
```

`handleReview` 函数开头增加同样的两道程序性拦截：历史未就绪时 return；拒绝原因不足 5 字时提示并 return。不能只依赖按钮 disabled。

在现有 `if (!token || !reviewModal) return` 之后、`setReviewing(true)` 之前插入：

```ts
if (reviewHistoryLoading || reviewHistoryError) {
  showMessage('error', '请先成功加载完整历史申请')
  return
}
if (reviewModal.action === 'reject' && adminComment.trim().length < 5) {
  showMessage('error', '拒绝原因至少填写5个字符')
  return
}
```

审核成功分支中的 `setReviewModal(null)` 和 `setAdminComment('')` 改为一次调用 `closeReviewModal()`。审核弹窗容器增加 `max-h-[90vh] overflow-y-auto`，确保历史较多时弹窗内部滚动，不把操作按钮推到视口外。

- [ ] **步骤 7：增加后台页面接线契约测试**

在 `__tests__/components/refund-application-history.test.ts` 追加读取 `src/app/admin/refunds/page.tsx` 的契约断言：

```ts
expect(adminPageSource).toContain('Authorization: `Bearer ${authToken}`')
expect(adminPageSource).toContain('正在加载历史申请')
expect(adminPageSource).toContain('重新获取')
expect(adminPageSource).toContain('reviewHistoryLoading || Boolean(reviewHistoryError)')
expect(adminPageSource).toContain('adminComment.trim().length < 5')
expect(adminPageSource).toContain('reviewHistoryRequestRef.current !== requestId')
expect(adminPageSource).toContain("records.some(record => record.id === item.id)")
expect(adminPageSource).toContain('<RefundApplicationHistory')
```

使用括号平衡提取 `handleReview`，断言历史失败和拒绝原因拦截均位于审核 `fetch` 之前，不允许固定 200/300 字符窗口或 `A || B` 宽松断言。

- [ ] **步骤 8：运行后台组件和审核接口测试**

```powershell
npx vitest run __tests__/components/refund-application-history.test.ts __tests__/api/admin/refunds/review-route.test.ts
```

预期：全部通过。

- [ ] **步骤 9：创建本地检查点提交**

```powershell
git add -- src/components/admin/refunds/RefundApplicationHistory.tsx src/app/admin/refunds/page.tsx __tests__/components/refund-application-history.test.ts
git commit -m "feat(admin): show refund application history"
```

---

### 任务 6：完整回归、真实页面验收和发布前复审

**文件：**
- 不新增业务文件。
- 检查任务 1 至 5 的全部文件。

- [ ] **步骤 1：运行针对性测试**

```powershell
npx vitest run __tests__/lib/refund-validation.test.ts __tests__/api/orders/refund-route.test.ts __tests__/components/refund-application-page.test.ts __tests__/api/admin/refunds/review-route.test.ts __tests__/components/refund-application-history.test.ts __tests__/components/order-after-sales-card.test.ts __tests__/api/orders/order-detail-route.test.ts __tests__/services/order.test.ts __tests__/services/order-notification.test.ts
```

预期：全部通过，0 个失败。

- [ ] **步骤 2：运行类型检查、代码规范和差异检查**

```powershell
npx tsc --noEmit -p tsconfig.typecheck.json
npx next lint --file "src/app/dashboard/orders/[id]/refund/page.tsx" --file "src/app/api/orders/[id]/refund/route.ts" --file "src/app/admin/refunds/page.tsx" --file "src/app/api/admin/refunds/[id]/review/route.ts" --file "src/components/admin/refunds/RefundApplicationHistory.tsx" --file "src/lib/refunds/refund-validation.ts"
git diff --check
```

预期：类型检查 0 错误；Lint（代码规范）0 Error；`git diff --check` 0 错误。Warning 必须逐条说明是否为修改前既有。

- [ ] **步骤 3：运行完整测试、覆盖率和生产构建**

```powershell
npm run test:coverage:check
npm run build
```

预期：完整测试 0 失败；语句覆盖率不低于 70%；生产构建退出码 0。

- [ ] **步骤 4：启动开发服务器完成真实浏览器验收**

```powershell
npm run dev
```

真实登录后依次验证并截图：

1. 质量问题无图不能提交，上传 1 张后可提交。
2. 商品损坏无图不能提交。
3. 未按约定时间发货无图可提交。
4. 其他无补充说明不能提交。
5. 被拒后重新申请，表单不出现上一次文字和图片。
6. 后台打开第二次申请，当前区域显示第 2 次申请及第二次图片。
7. 展开历史区域，显示第 1 次申请的文字、图片、拒绝状态和管理员备注。
8. 历史加载期间审核按钮禁用；模拟加载失败后只能重试，不能审核。
9. 拒绝原因少于 5 字不能提交；通过审核可不填备注。

若受登录认证限制无法自动截图，必须如实报告，并由胡子老师登录完成上述 9 项验收；不能用 build 成功代替页面验收。

- [ ] **步骤 5：复核禁止范围和提交文件清单**

```powershell
git status --short
git diff --name-only
git diff -- prisma/schema.prisma prisma/migrations package.json pnpm-lock.yaml
```

预期：数据库、迁移、依赖和配置 0 变更；只出现本计划列出的业务和测试文件。

- [ ] **步骤 6：交给小 M 只读复审**

复审重点必须包含：

- 前后端图片和说明校验完全一致。
- 失败路径无创建、无日志、无通知。
- 当前与历史申请图片不串数据。
- 申请序号按真实时间计算。
- 历史失败时不能审核。
- 拒绝原因三层防护：按钮、`handleReview`、后端接口。
- 退款资金、完成退款和通知链路无改动。

- [ ] **步骤 7：复审通过后再执行发布提交**

不得使用 `git add .`。按复审确认的精确文件逐个暂存，确认 `git diff --cached --name-only` 后提交：

```powershell
git commit -m "feat(refunds): require evidence and show application history"
git push origin main
git log origin/main --oneline -1
```

推送后必须确认远程提交编号等于本地提交编号，并在 Vercel 确认同一提交状态为 Ready（就绪）。

---

## 执行方案建议

### P0：立即执行

- 任务 1 至 5：共享校验、用户接口、用户页面、审核接口、后台历史展示。负责人：执行代理。预计 4 至 6 小时。
- 任务 6 自动化验证：负责人：执行代理。预计 30 至 60 分钟。

### P1：发布前完成

- 小 M 独立只读复审：预计 30 至 45 分钟。
- 胡子老师登录态 9 项页面验收：预计 20 至 30 分钟。

### P2：本轮不做

- 不新增图片数量之外的内容审核、图片识别或风控规则。
- 不调整退款金额、自动退款、通知模板或数据库模型。
- 不重构退款列表、详情弹窗和其他订单页面。
