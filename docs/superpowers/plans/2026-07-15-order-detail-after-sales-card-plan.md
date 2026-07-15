# 订单详情售后服务卡片实施计划

> **给执行代理：** 必须按 TDD（测试驱动开发）顺序逐项实施：先写失败测试，再做最小实现。当前项目使用猫爪执行、小M只读复审，因此实现阶段不得自行 commit、push 或部署。

**目标：** 将订单详情页底部的大号退款按钮和分散的退款状态卡片，统一为紧凑、唯一入口的售后服务区域，并在前后端阻止待审核或已通过退款的重复申请。

**架构：** 新建独立的 `OrderAfterSalesCard` 客户端组件，集中处理退款状态映射、唯一操作入口和原生 `<details>` 展开详情；订单详情页只负责传入订单状态、最新退款和跳转回调。退款 API 将进行中状态查询从单一 `pending` 扩展为 `pending + approved`，不改创建、通知、资金或数据库结构。

**技术栈：** Next.js 15 App Router、React 19、TypeScript、Tailwind CSS、Prisma 6、Vitest 4、React 服务端静态渲染测试。

## 全局约束

- 仅允许修改或新增本计划列出的 5 个文件。
- 不修改 Prisma schema，不执行 migration（迁移）。
- 不修改退款资金、审核、完成或通知链路。
- 不新增依赖，不修改 `package.json`、锁文件或 Vitest 配置。
- 已完成订单本轮仍不允许申请退款。
- 实现阶段不 commit、不 push、不部署；复审通过后另派发布任务。
- 不得使用 `$queryRaw` 或 `$queryRawUnsafe`。

---

## 文件结构

**新增：**

- `src/components/orders/OrderAfterSalesCard.tsx`：退款状态、唯一操作入口、详情展开和响应式展示。
- `__tests__/components/order-after-sales-card.test.tsx`：真实导入生产组件并服务端渲染各状态。
- `__tests__/api/orders/refund-route.test.ts`：退款申请接口的状态和副作用测试。

**修改：**

- `src/app/dashboard/orders/[id]/page.tsx`：删除旧退款状态卡片和底部满宽按钮，接入新组件。
- `src/app/api/orders/[id]/refund/route.ts`：拦截 `pending` 和 `approved` 进行中退款。

---

### 任务 1：退款接口进行中状态拦截

**文件：**

- 新增：`__tests__/api/orders/refund-route.test.ts`
- 修改：`src/app/api/orders/[id]/refund/route.ts`

**接口：**

- 输入保持 `POST /api/orders/[id]/refund` 现有 JSON。
- 输出保持 `{ success: false, error: string }`。
- 进行中退款统一错误：`该订单已有进行中的退款申请`。

- [ ] **步骤 1：先写接口失败测试**

测试必须 mock `verifyToken`、Prisma 和 `OrderNotificationService`，真实调用导出的 `POST`。

至少包含：

```typescript
it('已有 pending 退款时拒绝且不创建记录', async () => {
  prisma.refundRequest.findFirst.mockResolvedValueOnce({ id: 'refund-pending', status: 'pending' })
  const response = await POST(request, context)
  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({
    success: false,
    error: '该订单已有进行中的退款申请',
  })
  expect(prisma.refundRequest.create).not.toHaveBeenCalled()
  expect(OrderNotificationService.notifyRefundSubmitted).not.toHaveBeenCalled()
})

it('已有 approved 退款时拒绝且不创建记录', async () => {
  prisma.refundRequest.findFirst.mockResolvedValueOnce({ id: 'refund-approved', status: 'approved' })
  const response = await POST(request, context)
  expect(response.status).toBe(400)
  expect(prisma.refundRequest.create).not.toHaveBeenCalled()
})

it('只有 rejected 退款时允许重新申请', async () => {
  prisma.refundRequest.findFirst.mockResolvedValueOnce(null)
  const response = await POST(request, context)
  expect(response.status).toBe(200)
  expect(prisma.refundRequest.create).toHaveBeenCalledTimes(1)
})
```

同时覆盖未登录、订单不存在、非本人订单、非法订单状态、空原因和成功通知，锁住现有行为。

- [ ] **步骤 2：运行接口测试并确认修复前失败**

```powershell
npx vitest run __tests__/api/orders/refund-route.test.ts
```

预期：`approved` 进行中状态断言失败，证明测试能捕获旧逻辑。

- [ ] **步骤 3：做最小后端实现**

将单一状态查询：

```typescript
where: { orderId, status: 'pending' }
```

改为：

```typescript
where: {
  orderId,
  status: { in: ['pending', 'approved'] },
}
```

变量命名改为 `existingActiveRefund`，错误文案统一为：

```text
该订单已有进行中的退款申请
```

不得改动退款创建、通知调用或响应成功结构。

- [ ] **步骤 4：运行接口测试确认通过**

```powershell
npx vitest run __tests__/api/orders/refund-route.test.ts
```

预期：全部通过。

---

### 任务 2：售后服务组件与订单详情接入

**文件：**

- 新增：`src/components/orders/OrderAfterSalesCard.tsx`
- 新增：`__tests__/components/order-after-sales-card.test.tsx`
- 修改：`src/app/dashboard/orders/[id]/page.tsx`

**组件输入：**

```typescript
export interface OrderRefundSummary {
  id: string
  reason: string
  description: string | null
  images: string[] | null
  status: string
  adminComment: string | null
  createdAt: string
}

interface OrderAfterSalesCardProps {
  orderStatus: string
  latestRefund: OrderRefundSummary | null
  onApplyRefund: () => void
}
```

- [ ] **步骤 1：先写真实渲染失败测试**

测试使用：

```typescript
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { OrderAfterSalesCard } from '@/components/orders/OrderAfterSalesCard'
```

通过 `React.createElement(OrderAfterSalesCard, props)` 真实渲染生产组件，不得复制组件、不 mock 组件内部状态判断。

至少覆盖：

1. 无退款 + paid：只有一个小号“申请退款”，没有“重新申请”；
2. pending：显示“审核中”，没有任何申请按钮；
3. approved：显示“退款处理中”，没有任何申请按钮；
4. completed：显示“退款已完成”，没有任何申请按钮；
5. rejected：只有一个“重新申请”；
6. completed 订单且无退款：组件不渲染申请入口；
7. 未识别退款状态：显示中性状态且没有申请入口；
8. 有详情时输出原生 `<details>`、退款原因、补充说明、管理员备注和凭证；
9. 没有详情字段时不渲染空标签；
10. 页面源码不再包含旧满宽橙色退款按钮和旧重复审核条；
11. 页面源码只接入一次 `<OrderAfterSalesCard`。

按钮计数必须先枚举完整 `<button>...</button>`，再按文字筛选并断言数量，不得使用可跨标签的宽松正则。

- [ ] **步骤 2：运行组件测试并确认修复前失败**

```powershell
npx vitest run __tests__/components/order-after-sales-card.test.tsx
```

预期：生产组件不存在或页面仍含旧结构，测试失败。

- [ ] **步骤 3：创建 `OrderAfterSalesCard`**

组件要求：

- `'use client'`；
- 使用 `RotateCcw`、状态图标和 `ChevronDown`；
- 根据 `latestRefund.status` 映射中文状态、颜色和进度；
- 无退款时仅在 `paid` / `shipped` 显示小号描边“申请退款”；
- rejected 时仅显示小号“重新申请”；
- pending / approved / completed / 未识别状态不显示申请按钮；
- 使用原生 `<details>` + `<summary>` 实现“查看详情”，避免新增状态和依赖；
- 不使用嵌套卡片；
- 桌面 `sm:flex-row`，移动端 `flex-col`；
- 状态文字不能只依赖颜色。

按钮基准样式：

```text
inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium
rounded-lg border transition-colors
```

禁止出现旧样式组合：

```text
w-full py-3 text-white text-base bg-orange-600
```

- [ ] **步骤 4：接入订单详情页**

在金额明细之后渲染一次：

```tsx
<OrderAfterSalesCard
  orderStatus={order.status}
  latestRefund={order.refundRequests?.[0] ?? null}
  onApplyRefund={() => router.push(`/dashboard/orders/${order.id}/refund`)}
/>
```

删除：

- 旧“退款申请状态卡片”整块；
- 底部 `paid / shipped` 满宽退款按钮整块；
- 重复的“退款申请审核中”灰色横条；
- 页面不再使用的退款状态配置、图标或局部变量。

保留：

- 退款申请成功提示；
- 待支付按钮；
- 收益转余额弹窗；
- 订单状态、收货、物流、商品和金额区域。

- [ ] **步骤 5：运行组件测试确认通过**

```powershell
npx vitest run __tests__/components/order-after-sales-card.test.tsx
```

预期：全部通过。

---

### 任务 3：回归验证与真实页面检查

**文件：** 不新增文件。

- [ ] **步骤 1：运行两个新增测试文件**

```powershell
npx vitest run __tests__/api/orders/refund-route.test.ts __tests__/components/order-after-sales-card.test.tsx
```

- [ ] **步骤 2：运行退款相关最小回归**

根据仓库现有退款、订单详情和通知测试文件补充命令；不得运行完整测试套件。

- [ ] **步骤 3：运行正确类型检查**

```powershell
npx tsc --noEmit -p tsconfig.typecheck.json
```

- [ ] **步骤 4：运行目标文件代码规范检查**

```powershell
npx next lint --file src/app/dashboard/orders/[id]/page.tsx --file src/components/orders/OrderAfterSalesCard.tsx --file src/app/api/orders/[id]/refund/route.ts
```

必须 Error 为 0；既有 Warning 如实记录。

- [ ] **步骤 5：启动开发服务器并截图**

启动 `pnpm dev`，真实浏览器检查订单详情页桌面和移动宽度：

- 无退款时紧凑卡片；
- pending / approved 无申请按钮；
- rejected 唯一重新申请；
- 查看详情展开和收起；
- 页面不存在底部橙色大按钮；
- 无重叠、溢出、错位。

登录受限时必须如实记录登录拦截，使用真实 JSX 测试和源码核对作为补充，但不得写成浏览器验收通过。

- [ ] **步骤 6：检查范围和空白**

```powershell
git diff --check -- src/app/dashboard/orders/[id]/page.tsx src/app/api/orders/[id]/refund/route.ts src/components/orders/OrderAfterSalesCard.tsx __tests__/components/order-after-sales-card.test.tsx __tests__/api/orders/refund-route.test.ts
git status --short
```

确认净修改恰好 5 个文件，无临时脚本或输出。

- [ ] **步骤 7：停止并提交结果给复审**

本阶段不 commit、不 push、不部署。完整测试和生产 build 留到复审通过后的最终发布任务统一执行。

