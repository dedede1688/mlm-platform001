# Batch 5A-1 Public Product Write Lockdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove unauthenticated public product mutation methods from `/api/products/[id]` while keeping storefront reads and protected admin product writes working.

**Architecture:** Treat public product API as read-only and keep all write behavior inside the existing `/api/admin/products/*` routes. Add route-level tests that first prove public `PUT`/`DELETE` exports currently exist, then remove those exports and add admin auth regression tests to prove the write surface still exists only behind `verifyPermission`.

**Tech Stack:** Next.js App Router, TypeScript, Prisma ORM, Vitest, PowerShell local verification

## Global Constraints

- This is a P-level permission and product-write task. Do not push, deploy, migrate, or write production data without explicit 胡子老师 authorization.
- Follow approved design: `docs/superpowers/specs/2026-07-25-batch5a1-public-product-write-lockdown-design.md`.
- Public `/api/products` and `/api/products/[id]` must remain readable by storefront users.
- Public `/api/products/[id]` must not export `PUT` or `DELETE` after implementation.
- Product write behavior must remain under `/api/admin/products/*`.
- Backend admin product write routes must continue to call `verifyPermission(request, ['goods_admin', 'super_admin'])`.
- Do not modify Prisma schema, migrations, database rows, role model, middleware policy, admin menu, or product UI in this batch.
- Do not implement Batch 5A-2 operation-level permission rules in this batch.
- Use Prisma ORM only. `$queryRaw` and `$queryRawUnsafe` are prohibited.
- Use local binaries under `.\node_modules\.bin\`; do not use `npx`.
- Stage only exact authorized files with `git add -- <files>`. Never use `git add .`, `git add -A`, or `git add -u`.
- Capture RED evidence for the public route lockdown test before implementation and GREEN evidence after implementation.

---

## File Structure

- Modify: `src/app/api/products/[id]/route.ts` — remove public `PUT` and `DELETE`; keep public `GET` unchanged except any now-unused imports/comments cleanup.
- Create: `__tests__/api/products-public-route.test.ts` — prove public product detail `GET` still works and public route no longer exports `PUT`/`DELETE`.
- Create: `__tests__/api/admin/products-auth-route.test.ts` — protect against accidental unauthenticated admin write regressions by asserting admin POST/PUT/DELETE deny before database writes and call `verifyPermission` with the approved roles.
- Review only: `src/app/api/products/route.ts` — confirm public product list remains GET-only.
- Review only: `src/app/api/admin/products/route.ts` and `src/app/api/admin/products/[id]/route.ts` — no expected implementation change; tests should prove existing auth behavior.

---

### Task 1: Baseline and route surface audit

**Files:**
- Review only: `src/app/api/products/route.ts`
- Review only: `src/app/api/products/[id]/route.ts`
- Review only: `src/app/api/admin/products/route.ts`
- Review only: `src/app/api/admin/products/[id]/route.ts`

**Interfaces:**
- Consumes: existing public `GET` handlers and admin product handlers.
- Produces: no code change; produces baseline evidence that later changes are scoped.

- [ ] **Step 1: Record Git baseline**

Run:

```powershell
git status --short --branch
git diff --name-status
git diff --cached --name-status
git log -5 --oneline
git log origin/main -1 --oneline
```

Expected:

```text
Worktree is clean except any previously authorized ahead commits.
No staged changes.
No unrelated modified or untracked files.
```

If there are unrelated changes, stop and report them. Do not continue until 胡子老师 confirms they are safe to ignore.

- [ ] **Step 2: Confirm current vulnerable public route surface**

Run:

```powershell
rg -n "export async function (GET|POST|PUT|DELETE)|verifyPermission|verifyToken|prisma\.product\.(update|delete|create)" "src/app/api/products" "src/app/api/admin/products"
```

Expected current evidence before implementation:

```text
src/app/api/products/route.ts has GET only.
src/app/api/products/[id]/route.ts has GET, PUT, DELETE.
src/app/api/products/[id]/route.ts has prisma.product.update and prisma.product.delete.
src/app/api/products/[id]/route.ts does not have verifyPermission or verifyToken.
src/app/api/admin/products/route.ts and src/app/api/admin/products/[id]/route.ts have verifyPermission.
```

- [ ] **Step 3: Check whether frontend calls public write endpoints**

Run:

```powershell
rg -n "/api/products|method:\s*['""]PUT['""]|method:\s*['""]DELETE['""]" src
```

Allowed findings:

```text
Storefront GET calls to /api/products or /api/products/[id].
Admin page write calls to /api/admin/products or /api/admin/products/[id].
```

Stop and report if any source file sends `PUT` or `DELETE` to `/api/products/[id]` without `/api/admin/`.

---

### Task 2: Public product detail route lockdown

**Files:**
- Modify: `src/app/api/products/[id]/route.ts`
- Create: `__tests__/api/products-public-route.test.ts`

**Interfaces:**
- Consumes: `GET(request, { params })` from `@/app/api/products/[id]/route`.
- Produces: public route module that exports `GET` only; no `PUT`; no `DELETE`.
- Later tasks rely on these exact module export assertions:
  - `Object.prototype.hasOwnProperty.call(routeModule, 'PUT') === false`
  - `Object.prototype.hasOwnProperty.call(routeModule, 'DELETE') === false`

- [ ] **Step 1: Create failing public route test**

Create `__tests__/api/products-public-route.test.ts` with exactly this structure:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'

function getRequest() {
  return new Request('http://localhost/api/products/product-1', {
    method: 'GET',
  })
}

describe('public product detail route - Batch 5A-1', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps public GET available for storefront product detail', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValueOnce({
      id: 'product-1',
      name: '公开商品',
      status: 'active',
    } as any)

    const { GET } = await import('@/app/api/products/[id]/route')
    const response = await GET(getRequest() as any, {
      params: Promise.resolve({ id: 'product-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      success: true,
      data: {
        id: 'product-1',
        name: '公开商品',
        status: 'active',
      },
    })
    expect(prisma.product.findUnique).toHaveBeenCalledWith({
      where: { id: 'product-1' },
    })
  })

  it('does not export public PUT for product mutation', async () => {
    const routeModule = await import('@/app/api/products/[id]/route')

    expect(Object.prototype.hasOwnProperty.call(routeModule, 'PUT')).toBe(false)
    expect(prisma.product.update).not.toHaveBeenCalled()
  })

  it('does not export public DELETE for product deletion', async () => {
    const routeModule = await import('@/app/api/products/[id]/route')

    expect(Object.prototype.hasOwnProperty.call(routeModule, 'DELETE')).toBe(false)
    expect(prisma.product.delete).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the new test and capture RED evidence**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run __tests__/api/products-public-route.test.ts --reporter=verbose
```

Expected before implementation:

```text
The GET test passes.
The PUT export test fails because the module currently exports PUT.
The DELETE export test fails because the module currently exports DELETE.
```

If the test file cannot import `@/app/api/products/[id]/route`, fix only the test import path according to existing project alias behavior and rerun. Do not change production code before recording the RED failure.

- [ ] **Step 3: Remove public PUT and DELETE from route implementation**

In `src/app/api/products/[id]/route.ts`, keep:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 获取商品详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const product = await prisma.product.findUnique({
      where: { id },
    })

    if (!product) {
      return NextResponse.json(
        { error: '商品不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: product,
    })
  } catch (error) {
    console.error('Get product error:', error)
    return NextResponse.json(
      { error: '获取商品详情失败' },
      { status: 500 }
    )
  }
}
```

Delete the entire block from:

```ts
// 更新商品（用户端）
export async function PUT(
```

through the end of the `PUT` handler.

Delete the entire block from:

```ts
// 删除商品
export async function DELETE(
```

through the end of the `DELETE` handler.

Do not add `verifyPermission` to this public route. Do not add explicit 405 handlers.

- [ ] **Step 4: Run the public route test and capture GREEN evidence**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run __tests__/api/products-public-route.test.ts --reporter=verbose
```

Expected:

```text
3 tests passed.
GET still works.
PUT export is absent.
DELETE export is absent.
```

- [ ] **Step 5: Run targeted public route safety scan**

Run:

```powershell
Select-String -LiteralPath ".\src\app\api\products\[id]\route.ts" -Pattern "export async function (PUT|DELETE)|prisma\.product\.(update|delete)|verifyPermission|verifyToken"
```

Expected:

```text
No output.
```

If output contains `verifyPermission` or `verifyToken`, remove it; the public route should be read-only, not a second admin route.

---

### Task 3: Admin product write auth regression tests

**Files:**
- Create: `__tests__/api/admin/products-auth-route.test.ts`
- Review only: `src/app/api/admin/products/route.ts`
- Review only: `src/app/api/admin/products/[id]/route.ts`

**Interfaces:**
- Consumes:
  - `POST` from `@/app/api/admin/products/route`
  - `PUT` and `DELETE` from `@/app/api/admin/products/[id]/route`
  - `verifyPermission(request, ['goods_admin', 'super_admin'])`
- Produces: regression tests proving denied admin writes return before product database writes.

- [ ] **Step 1: Create admin auth regression test**

Create `__tests__/api/admin/products-auth-route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/utils/admin-auth', () => ({
  verifyPermission: vi.fn(),
}))

vi.mock('@/lib/utils/operation-log', () => ({
  logOperation: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      updateMany: vi.fn(),
    },
    category: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { logOperation } from '@/lib/utils/operation-log'

function jsonRequest(url: string, method: string, body: unknown = {}) {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function deniedAuth() {
  return {
    user: null,
    error: Response.json(
      { success: false, message: '权限不足' },
      { status: 403 }
    ),
  } as any
}

describe('admin product write auth - Batch 5A-1', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('denies admin product create before database write', async () => {
    vi.mocked(verifyPermission).mockResolvedValueOnce(deniedAuth())

    const { POST } = await import('@/app/api/admin/products/route')
    const response = await POST(jsonRequest('http://localhost/api/admin/products', 'POST') as any)

    expect(response.status).toBe(403)
    expect(verifyPermission).toHaveBeenCalledWith(
      expect.anything(),
      ['goods_admin', 'super_admin']
    )
    expect(prisma.product.create).not.toHaveBeenCalled()
    expect(logOperation).not.toHaveBeenCalled()
  })

  it('denies admin product update before database write', async () => {
    vi.mocked(verifyPermission).mockResolvedValueOnce(deniedAuth())

    const { PUT } = await import('@/app/api/admin/products/[id]/route')
    const response = await PUT(
      jsonRequest('http://localhost/api/admin/products/product-1', 'PUT') as any,
      { params: Promise.resolve({ id: 'product-1' }) }
    )

    expect(response.status).toBe(403)
    expect(verifyPermission).toHaveBeenCalledWith(
      expect.anything(),
      ['goods_admin', 'super_admin']
    )
    expect(prisma.product.findUnique).not.toHaveBeenCalled()
    expect(prisma.product.update).not.toHaveBeenCalled()
    expect(logOperation).not.toHaveBeenCalled()
  })

  it('denies admin product delete before database write', async () => {
    vi.mocked(verifyPermission).mockResolvedValueOnce(deniedAuth())

    const { DELETE } = await import('@/app/api/admin/products/[id]/route')
    const response = await DELETE(
      jsonRequest('http://localhost/api/admin/products/product-1', 'DELETE') as any,
      { params: Promise.resolve({ id: 'product-1' }) }
    )

    expect(response.status).toBe(403)
    expect(verifyPermission).toHaveBeenCalledWith(
      expect.anything(),
      ['goods_admin', 'super_admin']
    )
    expect(prisma.product.findUnique).not.toHaveBeenCalled()
    expect(prisma.product.update).not.toHaveBeenCalled()
    expect(prisma.product.delete).not.toHaveBeenCalled()
    expect(logOperation).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run admin auth regression test**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run __tests__/api/admin/products-auth-route.test.ts --reporter=verbose
```

Expected:

```text
3 tests passed.
Each denied write calls verifyPermission with ['goods_admin', 'super_admin'].
No product database write method is called after denial.
```

If a test fails because the route currently writes before auth, fix the route to call `verifyPermission` first. Do not change the approved role array unless 胡子老师 explicitly approves a Batch 5A-2 scope expansion.

- [ ] **Step 3: Run combined Batch 5A-1 route tests**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run __tests__/api/products-public-route.test.ts __tests__/api/admin/products-auth-route.test.ts --reporter=verbose
```

Expected:

```text
6 tests passed.
```

---

### Task 4: Full verification and exact commit

**Files:**
- Modify: `src/app/api/products/[id]/route.ts`
- Create: `__tests__/api/products-public-route.test.ts`
- Create: `__tests__/api/admin/products-auth-route.test.ts`

**Interfaces:**
- Consumes: completed Task 2 and Task 3.
- Produces: one implementation commit ready for 小酷 review and 小M read-only review.

- [ ] **Step 1: Run targeted tests**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run __tests__/api/products-public-route.test.ts __tests__/api/admin/products-auth-route.test.ts --reporter=verbose
```

Expected:

```text
6 tests passed.
```

- [ ] **Step 2: Run product service regression tests**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run __tests__/services/product.test.ts --reporter=verbose
```

Expected:

```text
All ProductService tests pass.
```

- [ ] **Step 3: Run full test suite**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run
```

Expected:

```text
All test files passed.
0 failed tests.
```

- [ ] **Step 4: Run TypeScript and Prisma checks**

Run:

```powershell
.\node_modules\.bin\tsc.cmd --noEmit --project tsconfig.typecheck.json
.\node_modules\.bin\prisma.cmd validate
.\node_modules\.bin\prisma.cmd generate
```

Expected:

```text
TypeScript has 0 errors.
Prisma schema is valid.
Prisma Client generation succeeds.
```

- [ ] **Step 5: Run production build**

Run:

```powershell
.\node_modules\.bin\next.cmd build
```

Expected:

```text
Build succeeds.
No TypeScript build errors.
No missing route/module errors.
```

- [ ] **Step 6: Run final security scans**

Run:

```powershell
Select-String -LiteralPath ".\src\app\api\products\[id]\route.ts" -Pattern "export async function (PUT|DELETE)|prisma\.product\.(update|delete)|verifyPermission|verifyToken"
Select-String -LiteralPath ".\src\app\api\admin\products\route.ts",".\src\app\api\admin\products\[id]\route.ts" -Pattern "verifyPermission"
rg -n "export async function (PUT|DELETE)" "src/app/api/products"
```

Expected:

```text
First command: no output.
Second command: verifyPermission is present in admin product route files.
Third command: no public product PUT or DELETE exports.
```

- [ ] **Step 7: Check diff scope and whitespace**

Run:

```powershell
git diff --check
git diff --name-status
git diff --cached --name-status
git status --short --branch
```

Expected changed files only:

```text
M  src/app/api/products/[id]/route.ts
A  __tests__/api/products-public-route.test.ts
A  __tests__/api/admin/products-auth-route.test.ts
```

There must be no migration, no Prisma schema change, no admin UI change, no middleware change, and no unrelated docs change.

- [ ] **Step 8: Stage exact files only**

Run:

```powershell
git add -- "src/app/api/products/[id]/route.ts" "__tests__/api/products-public-route.test.ts" "__tests__/api/admin/products-auth-route.test.ts"
git diff --cached --check
git diff --cached --name-status
```

Expected staged files only:

```text
M  src/app/api/products/[id]/route.ts
A  __tests__/api/products-public-route.test.ts
A  __tests__/api/admin/products-auth-route.test.ts
```

- [ ] **Step 9: Commit implementation**

Run:

```powershell
git commit -m "fix: remove public product write handlers"
git status --short --branch
git log -3 --oneline
```

Expected:

```text
New commit exists with message fix: remove public product write handlers.
Working tree is clean.
No staged changes.
No push.
No deploy.
No migration.
No production database write.
```

---

## Self-Review Checklist

- [ ] The plan implements every approved design goal from `docs/superpowers/specs/2026-07-25-batch5a1-public-product-write-lockdown-design.md`.
- [ ] The public storefront GET path remains covered by test.
- [ ] Public `PUT` and `DELETE` are explicitly covered by failing-then-passing export tests.
- [ ] Existing admin write routes are not duplicated or moved.
- [ ] Admin write route permission checks are covered by regression tests.
- [ ] Batch 5A-2 operation-level role work is explicitly excluded.
- [ ] No migration, database write, push, or deploy is included.
- [ ] All staging commands use exact file paths.

## Handoff Report Format

小猫完成后必须按下面格式回报：

```text
Batch 5A-1 执行报告

1. 三态结论：通过 / 有条件通过 / 不通过
2. 执行前基线：
   - HEAD:
   - origin/main:
   - git status:
3. RED 证据：
   - public route test 首次失败点：
4. 修改文件：
   - src/app/api/products/[id]/route.ts
   - __tests__/api/products-public-route.test.ts
   - __tests__/api/admin/products-auth-route.test.ts
5. GREEN 验证：
   - targeted route tests:
   - product service test:
   - full vitest:
   - typecheck:
   - prisma validate/generate:
   - next build:
   - security scan:
6. commit:
   - hash:
   - message:
7. 最终状态：
   - git status:
8. 安全声明：
   - 未 push
   - 未 deploy
   - 未 migration
   - 未写生产数据库
   - 未修改 Batch 5A-2 范围
```

## Post-Implementation Review Gate

小猫提交后，小酷必须先做独立审核。小酷审核通过后，再派小M做只读复审。

小M复审提示词必须重点要求：

1. 核查公开 `/api/products/[id]` 是否已经没有 `PUT` / `DELETE`。
2. 核查公开商品路由是否没有 `prisma.product.update` / `prisma.product.delete`。
3. 核查商城公开 GET 未被破坏。
4. 核查后台商品写接口仍有 `verifyPermission(['goods_admin', 'super_admin'])`。
5. 核查是否误混 Batch 5A-2 的角色操作级权限重构。
6. 核查验证命令是否真实全绿。
