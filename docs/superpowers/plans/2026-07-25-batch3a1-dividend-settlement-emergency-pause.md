# Batch 3A-1 Dividend Settlement Emergency Pause Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不修改生产数据和其他奖励逻辑的前提下，阻止自动或手动周结再次增加用户可提现收益，并向调用方明确报告“结算暂停”。

**Architecture:** 在 `DividendService.settleWeeklyDividends()` 设置不可绕过的服务层总闸，所有调用在进入 Prisma 事务前返回结构化暂停结果。`runWeeklyTasks()` 将该结果传播为失败但非异常的暂停状态，后台手动结算接口将同一状态转换为 HTTP 503；每日快照和其他资金链路保持不变。

**Tech Stack:** Next.js 15 App Router、TypeScript 5.7、Prisma 6、Vitest 4、Vercel Cron

## Global Constraints

- 本任务为 P 级资金止血，只能修改本计划列出的文件。
- 不执行任何生产数据库 `INSERT`、`UPDATE`、`DELETE`、DDL 或 migration。
- 不修改 `vercel.json`、Prisma schema、`RewardService.createDividendReward()`、退款、提现、订单支付、直推奖或品牌管理奖。
- 当前 2 条、合计 ¥50 的未结算分红保持原状。
- 暂停开关必须是代码内名称明确的模块级常量，不依赖环境变量。
- 自动周结和后台手动周结均不得产生任何 Prisma 事务或资金写入。
- 后台手动 `action=settle` 必须返回 HTTP 503、`success=false`、`paused=true`。
- `action=snapshot` 和原有权限校验不得回归。
- 严禁 `git add .` 和 `git add -A`，每次只精确暂存当前任务文件。
- 未经胡子老师明确授权，不推送、不部署、不写数据库。

---

## File Structure

- Modify: `src/lib/services/dividend.service.ts` — 唯一资金总闸和暂停结果定义。
- Modify: `__tests__/services/dividend.test.ts` — 证明服务层在暂停时零事务、零资金写入。
- Modify: `src/lib/utils/cron.ts` — 将服务层暂停状态传播给每周任务。
- Create: `__tests__/lib/cron.test.ts` — 验证每周任务不会把暂停误报为成功。
- Modify: `src/app/api/admin/settle-dividends/route.ts` — 将手动周结暂停映射为 HTTP 503。
- Create: `__tests__/api/admin/settle-dividends-route.test.ts` — 验证权限、503 和每日快照不回归。

### Task 1: 服务层资金总闸

**Files:**
- Modify: `__tests__/services/dividend.test.ts:176-312`
- Modify: `src/lib/services/dividend.service.ts:8-9,224-228`

**Interfaces:**
- Produces: `DividendService.settleWeeklyDividends(): Promise<DividendSettlementResult>`
- Produces result:

```ts
{
  paused: true,
  batchId: null,
  totalAmount: 0,
  totalDividends: 0,
  distributedUsers: 0,
  details: [],
  message: '分红结算维护中，当前未执行任何资金操作',
}
```

- [ ] **Step 1: 用暂停测试替换旧的“周结会入账”测试组**

在 `__tests__/services/dividend.test.ts` 中，将现有 `describe('settleWeeklyDividends', ...)` 整组替换为：

```ts
describe('settleWeeklyDividends - Batch 3A-1 紧急暂停', () => {
  it('returns an explicit paused result before opening a transaction', async () => {
    const result = await DividendService.settleWeeklyDividends()

    expect(result).toEqual({
      paused: true,
      batchId: null,
      totalAmount: 0,
      totalDividends: 0,
      distributedUsers: 0,
      details: [],
      message: '分红结算维护中，当前未执行任何资金操作',
    })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('performs no fund, ledger, reward, or settlement writes while paused', async () => {
    await DividendService.settleWeeklyDividends()

    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(prisma.user.updateMany).not.toHaveBeenCalled()
    expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
    expect(prisma.balanceRecord.createMany).not.toHaveBeenCalled()
    expect(prisma.reward.create).not.toHaveBeenCalled()
    expect(prisma.reward.createMany).not.toHaveBeenCalled()
    expect(prisma.dividend.update).not.toHaveBeenCalled()
    expect(prisma.dividend.updateMany).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 运行测试并确认先失败**

Run:

```powershell
& ".\node_modules\.bin\vitest.cmd" run __tests__/services/dividend.test.ts
```

Expected: FAIL。失败证据至少包含旧实现调用了 `prisma.$transaction`，或返回结果缺少 `paused: true`。

- [ ] **Step 3: 在服务层增加硬编码暂停总闸**

在 `src/lib/services/dividend.service.ts` 的 import 下方增加：

```ts
const DIVIDEND_SETTLEMENT_PAUSED = true

export type DividendSettlementResult = {
  paused?: boolean
  batchId: string | null
  totalAmount: number
  totalDividends: number
  distributedUsers: number
  details: Array<{ userId: string; amount: number; dividendCount: number }>
  message: string
}
```

将方法签名和开头改为：

```ts
static async settleWeeklyDividends(): Promise<DividendSettlementResult> {
  if (DIVIDEND_SETTLEMENT_PAUSED) {
    const result: DividendSettlementResult = {
      paused: true,
      batchId: null,
      totalAmount: 0,
      totalDividends: 0,
      distributedUsers: 0,
      details: [],
      message: '分红结算维护中，当前未执行任何资金操作',
    }
    logger.warn('[Batch 3A-1] 分红周结已暂停，未执行任何资金操作')
    return result
  }

  return await prisma.$transaction(async (tx) => {
```

保留暂停总闸之后的旧结算代码，作为 Batch 3A-2 重构前的历史实现；不得改动其资金逻辑。

在旧事务的两个返回对象中补充 `paused: false`，确保返回类型和调用方判断明确：

```ts
return {
  paused: false,
  batchId: null,
  totalAmount: 0,
  totalDividends: 0,
  distributedUsers: 0,
  details: [],
  message: '无待结算的分红明细',
}
```

以及：

```ts
return {
  paused: false,
  batchId,
  totalAmount,
  totalDividends: unsettledDividends.length,
  distributedUsers: details.length,
  details,
  message: `周结分红入账成功（批次 ${batchId}），共 ${unsettledDividends.length} 条明细，${details.length} 位用户`,
}
```

- [ ] **Step 4: 运行服务测试并确认通过**

Run:

```powershell
& ".\node_modules\.bin\vitest.cmd" run __tests__/services/dividend.test.ts
```

Expected: PASS，且该文件全部测试通过。

- [ ] **Step 5: 精确提交服务层总闸**

```powershell
git add -- "__tests__/services/dividend.test.ts" "src/lib/services/dividend.service.ts"
git diff --cached --check
git diff --cached --name-status
git commit -m "fix: pause dividend settlement fund writes"
```

Expected staged files: exactly 2.

### Task 2: 每周任务传播暂停状态

**Files:**
- Create: `__tests__/lib/cron.test.ts`
- Modify: `src/lib/utils/cron.ts:53-69`

**Interfaces:**
- Consumes: `DividendService.settleWeeklyDividends(): Promise<DividendSettlementResult>`
- Produces: `runWeeklyTasks(): Promise<{ dividendSettle: WeeklyDividendSettleStatus }>`
- Produces paused status:

```ts
{
  success: false,
  paused: true,
  data: DividendSettlementResult,
}
```

- [ ] **Step 1: 新建每周任务失败测试**

创建 `__tests__/lib/cron.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/points.service', () => ({
  PointsService: { dailyUnlock: vi.fn() },
}))

vi.mock('@/lib/services/order-lifecycle.service', () => ({
  OrderLifecycleService: { autoCompleteOrders: vi.fn() },
}))

vi.mock('@/lib/services/dividend.service', () => ({
  DividendService: {
    snapshotDailyDividends: vi.fn(),
    settleWeeklyDividends: vi.fn(),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { DividendService } from '@/lib/services/dividend.service'
import { logger } from '@/lib/logger'
import { runWeeklyTasks } from '@/lib/utils/cron'

describe('runWeeklyTasks - Batch 3A-1', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports settlement pause as paused and unsuccessful without throwing', async () => {
    const pausedResult = {
      paused: true,
      batchId: null,
      totalAmount: 0,
      totalDividends: 0,
      distributedUsers: 0,
      details: [],
      message: '分红结算维护中，当前未执行任何资金操作',
    }
    vi.mocked(DividendService.settleWeeklyDividends).mockResolvedValueOnce(pausedResult)

    const result = await runWeeklyTasks()

    expect(result.dividendSettle).toEqual({
      success: false,
      paused: true,
      data: pausedResult,
    })
    expect(logger.warn).toHaveBeenCalledWith(
      '[Batch 3A-1] 分红周结任务已暂停',
      { reason: pausedResult.message }
    )
    expect(logger.info).not.toHaveBeenCalledWith(
      '✅ 分红周结入账完成',
      expect.anything()
    )
  })
})
```

- [ ] **Step 2: 运行测试并确认先失败**

Run:

```powershell
& ".\node_modules\.bin\vitest.cmd" run __tests__/lib/cron.test.ts
```

Expected: FAIL。旧实现返回 `success: true`，且没有 `paused: true`。

- [ ] **Step 3: 增加明确类型并传播暂停状态**

在 `src/lib/utils/cron.ts` 的 `runWeeklyTasks()` 前增加：

```ts
type WeeklyDividendSettleStatus = {
  success: boolean
  paused?: boolean
  data?: unknown
  error?: string
}
```

将结果声明改为：

```ts
const results: { dividendSettle?: WeeklyDividendSettleStatus } = {}
```

将调用部分改为：

```ts
const dividendResult = await DividendService.settleWeeklyDividends()
if (dividendResult.paused) {
  logger.warn('[Batch 3A-1] 分红周结任务已暂停', {
    reason: dividendResult.message,
  })
  results.dividendSettle = {
    success: false,
    paused: true,
    data: dividendResult,
  }
} else {
  logger.info('✅ 分红周结入账完成', { data: dividendResult })
  results.dividendSettle = { success: true, data: dividendResult }
}
```

保留现有 `catch`，系统异常仍返回 `success: false` 和 `error`。

- [ ] **Step 4: 运行每周任务与服务层测试**

Run:

```powershell
& ".\node_modules\.bin\vitest.cmd" run __tests__/lib/cron.test.ts __tests__/services/dividend.test.ts
```

Expected: 2 个测试文件全部 PASS。

- [ ] **Step 5: 精确提交任务状态传播**

```powershell
git add -- "__tests__/lib/cron.test.ts" "src/lib/utils/cron.ts"
git diff --cached --check
git diff --cached --name-status
git commit -m "fix: report paused weekly dividend settlement"
```

Expected staged files: exactly 2.

### Task 3: 后台手动结算返回 503

**Files:**
- Create: `__tests__/api/admin/settle-dividends-route.test.ts`
- Modify: `src/app/api/admin/settle-dividends/route.ts:7-40`

**Interfaces:**
- Consumes: `DividendService.settleWeeklyDividends(): Promise<DividendSettlementResult>`
- Produces `POST action=settle`: HTTP 503 with `{ success: false, paused: true, error: string }`
- Preserves `POST action=snapshot`: HTTP 200 with `{ success: true, data: unknown }`

- [ ] **Step 1: 新建后台路由失败测试**

创建 `__tests__/api/admin/settle-dividends-route.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/utils/admin-auth', () => ({
  verifyPermission: vi.fn(),
}))

vi.mock('@/lib/services/dividend.service', () => ({
  DividendService: {
    settleWeeklyDividends: vi.fn(),
    snapshotDailyDividends: vi.fn(),
    getTodayDividendSummary: vi.fn(),
  },
}))

import { verifyPermission } from '@/lib/utils/admin-auth'
import { DividendService } from '@/lib/services/dividend.service'

const admin = { id: 'admin-1', role: 'finance_admin' } as any

function post(body: unknown) {
  return new Request('http://localhost/api/admin/settle-dividends', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/admin/settle-dividends - Batch 3A-1', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('preserves permission denial and does not call either operation', async () => {
    const denied = Response.json({ success: false, error: '权限不足' }, { status: 403 })
    vi.mocked(verifyPermission).mockResolvedValueOnce({ user: null, error: denied } as any)

    const { POST } = await import('@/app/api/admin/settle-dividends/route')
    const response = await POST(post({ action: 'settle' }) as any)

    expect(response.status).toBe(403)
    expect(DividendService.settleWeeklyDividends).not.toHaveBeenCalled()
    expect(DividendService.snapshotDailyDividends).not.toHaveBeenCalled()
  })

  it('returns 503 and explicit paused response for manual settlement', async () => {
    vi.mocked(verifyPermission).mockResolvedValueOnce({ user: admin, error: null } as any)
    vi.mocked(DividendService.settleWeeklyDividends).mockResolvedValueOnce({
      paused: true,
      batchId: null,
      totalAmount: 0,
      totalDividends: 0,
      distributedUsers: 0,
      details: [],
      message: '分红结算维护中，当前未执行任何资金操作',
    })

    const { POST } = await import('@/app/api/admin/settle-dividends/route')
    const response = await POST(post({ action: 'settle' }) as any)
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toEqual({
      success: false,
      paused: true,
      error: '分红结算维护中，当前未执行任何资金操作',
    })
    expect(DividendService.settleWeeklyDividends).toHaveBeenCalledTimes(1)
    expect(DividendService.snapshotDailyDividends).not.toHaveBeenCalled()
  })

  it('keeps snapshot behavior unchanged', async () => {
    vi.mocked(verifyPermission).mockResolvedValueOnce({ user: admin, error: null } as any)
    const snapshot = { message: '分红快照成功', distributedUsers: 2 }
    vi.mocked(DividendService.snapshotDailyDividends).mockResolvedValueOnce(snapshot as any)

    const { POST } = await import('@/app/api/admin/settle-dividends/route')
    const response = await POST(post({ action: 'snapshot' }) as any)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ success: true, data: snapshot })
    expect(DividendService.snapshotDailyDividends).toHaveBeenCalledTimes(1)
    expect(DividendService.settleWeeklyDividends).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 运行测试并确认先失败**

Run:

```powershell
& ".\node_modules\.bin\vitest.cmd" run __tests__/api/admin/settle-dividends-route.test.ts
```

Expected: FAIL。旧路由对暂停结果返回 HTTP 200 和 `success: true`。

- [ ] **Step 3: 将暂停结果映射为 HTTP 503**

将 `src/app/api/admin/settle-dividends/route.ts` 的 `action === 'settle'` 分支改为：

```ts
if (action === 'settle') {
  result = await DividendService.settleWeeklyDividends()
  if (result.paused) {
    return NextResponse.json(
      {
        success: false,
        paused: true,
        error: result.message,
      },
      { status: 503 }
    )
  }
} else {
  result = await DividendService.snapshotDailyDividends()
}
```

其余成功响应、权限校验、JSON 解析兜底和 GET 路由保持不变。

- [ ] **Step 4: 运行三个相关测试文件**

Run:

```powershell
& ".\node_modules\.bin\vitest.cmd" run __tests__/api/admin/settle-dividends-route.test.ts __tests__/lib/cron.test.ts __tests__/services/dividend.test.ts
```

Expected: 3 个测试文件全部 PASS。

- [ ] **Step 5: 精确提交后台暂停响应**

```powershell
git add -- "__tests__/api/admin/settle-dividends-route.test.ts" "src/app/api/admin/settle-dividends/route.ts"
git diff --cached --check
git diff --cached --name-status
git commit -m "fix: block manual dividend settlement"
```

Expected staged files: exactly 2.

### Task 4: 全量验证与 P 级交付

**Files:**
- Verify only: all six implementation/test files
- Do not modify: production data, Prisma schema, migrations, `vercel.json`

**Interfaces:**
- Consumes the completed behavior from Tasks 1–3.
- Produces a verification report for 小酷、小M and 胡子老师.

- [ ] **Step 1: 运行全量测试**

```powershell
& ".\node_modules\.bin\vitest.cmd" run
```

Expected: all test files PASS，0 failed。

- [ ] **Step 2: 运行 TypeScript 检查**

```powershell
& ".\node_modules\.bin\tsc.cmd" --noEmit --project tsconfig.typecheck.json
```

Expected: exit code 0，0 errors。

- [ ] **Step 3: 运行生产构建**

```powershell
& ".\node_modules\.bin\next.cmd" build
```

Expected: exit code 0，build successful。

- [ ] **Step 4: 核对差异范围和禁止项**

```powershell
git status --short
git diff --name-status HEAD~3..HEAD
git diff --check HEAD~3..HEAD
git diff HEAD~3..HEAD -- "vercel.json" "prisma/schema.prisma" "prisma/migrations"
rg -n "DIVIDEND_SETTLEMENT_PAUSED|paused: true|status: 503" `
  "src/lib/services/dividend.service.ts" `
  "src/lib/utils/cron.ts" `
  "src/app/api/admin/settle-dividends/route.ts"
```

Expected:

- 实现差异只涉及计划列出的 6 个文件；
- `vercel.json`、Prisma schema 和 migrations 无差异；
- 无未暂存或未提交实现文件；
- 三层暂停标记全部存在。

- [ ] **Step 5: 形成执行报告并停止**

执行报告必须包含：

- 三个实现 commit hash；
- 修改文件清单；
- 首次失败测试证据与修复后通过结果；
- 全量测试、typecheck、build 结果；
- 明确声明未写数据库、未推送、未部署；
- 明确声明当前 ¥50 未被主动调整；
- 请求小酷审核，禁止自行推送或部署。

## Post-Implementation Gates

实现完成后必须依次经过：

1. 小酷核对实现与本计划；
2. 小M执行 P 级独立只读复审；
3. 胡子老师批准提交发布；
4. 推送后核对本地 HEAD 与 `origin/main`；
5. 核对 Vercel Production 部署 commit 与 Ready 状态；
6. 线上只验证暂停响应，不执行真实资金结算；
7. 确认生产库未新增 `daily_dividend` 周结流水、未新增 `type=dividend` 周结奖励、当前 ¥50 未再次入账。
