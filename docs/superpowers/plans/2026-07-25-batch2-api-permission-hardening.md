# Batch 2 API Permission Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Project role rules override the generic skill's commit guidance: the executor must not stage, commit, push, deploy, or write the database.

**Goal:** Remove two obsolete write surfaces, complete middleware coverage for active admin API groups, and lock the intended authorization boundary with tests.

**Architecture:** Public product reads remain on `/api/products`, while all product mutations stay under the existing protected `/api/admin/products/**` routes. System parameters use only `/api/admin/system-config/parameters`. Middleware performs signed-token and top-level role filtering; route-level `verifyPermission` remains the final database-backed authorization check.

**Tech Stack:** Next.js 15 App Router, TypeScript 5.7, Vitest 4, JSON Web Tokens, Prisma 6.

## Global Constraints

- This is a P-level permission change.
- Do not modify Prisma schema, migrations, production data, role names, admin menus, or UI.
- Do not change response formats outside the endpoints explicitly removed.
- Do not add dependencies.
- Do not use `$queryRaw` or `$queryRawUnsafe`.
- Preserve and do not stage, restore, overwrite, or reformat the pre-existing changes in `package.json`, `src/lib/logger.ts`, `docs/项目清单.md`, and `.workbuddy/memory/*`.
- Use exact-path Git inspection only. Never run `git add .`, `git add -A`, `git commit`, `git push`, or deployment commands.
- The executor stops after implementation and verification. 小酷 reviews the work, then 小M performs the mandatory independent pre-commit review.

---

## File Map

- Create `__tests__/security/api-permission-boundaries.test.ts`: source-level regression tests for route exports, removed legacy route, canonical system-parameter authorization, and middleware map completeness.
- Modify `src/app/api/products/route.ts`: keep public GET and remove public POST.
- Delete `src/app/api/admin/config/route.ts`: retire the duplicate legacy system-config API.
- Modify `src/middleware.ts`: add top-level role mappings for dashboard, roles, and role-permissions.
- Modify `__tests__/middleware.test.ts`: replace the legacy config exception test and add role-matrix behavior tests.

No other file is in scope.

### Task 1: Add Failing API Boundary Tests

**Files:**
- Create: `__tests__/security/api-permission-boundaries.test.ts`
- Inspect: `src/app/api/products/route.ts`
- Inspect: `src/app/api/admin/config/route.ts`
- Inspect: `src/app/api/admin/system-config/parameters/route.ts`
- Inspect: `src/middleware.ts`

**Interfaces:**
- Consumes: repository source files resolved from `process.cwd()`.
- Produces: static security contract tests that fail against the pre-change source and pass only when the approved route boundaries exist.

- [ ] **Step 1: Create the failing contract test**

Create `__tests__/security/api-permission-boundaries.test.ts` with:

```typescript
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8')
}

describe('Batch 2 API permission boundaries', () => {
  it('keeps the public product route read-only', () => {
    const source = read('src/app/api/products/route.ts')

    expect(source).toMatch(/export async function GET\s*\(/)
    expect(source).not.toMatch(/export async function POST\s*\(/)
    expect(source).not.toContain('prisma.product.create')
  })

  it('removes the legacy admin config route', () => {
    expect(existsSync(join(root, 'src/app/api/admin/config/route.ts'))).toBe(false)
  })

  it('keeps system parameters on the canonical super-admin route', () => {
    const source = read('src/app/api/admin/system-config/parameters/route.ts')

    expect(source).toMatch(/export async function GET\s*\(/)
    expect(source).toMatch(/export async function PUT\s*\(/)
    expect(source.match(/verifyPermission\(request, \['super_admin'\]\)/g)).toHaveLength(2)
  })

  it.each([
    '/api/admin/dashboard',
    '/api/admin/roles',
    '/api/admin/role-permissions',
  ])('maps %s in middleware', (prefix) => {
    const source = read('src/middleware.ts')
    expect(source).toContain(`'${prefix}'`)
  })
})
```

- [ ] **Step 2: Run the contract test and confirm the expected failures**

Run:

```powershell
& ".\node_modules\.bin\vitest.cmd" run __tests__/security/api-permission-boundaries.test.ts
```

Expected: FAIL because the public product route still exports POST, the legacy config route still exists, and the three middleware prefixes are absent. Record the failing assertion names in the execution report.

### Task 2: Remove Duplicate Write Surfaces

**Files:**
- Modify: `src/app/api/products/route.ts`
- Delete: `src/app/api/admin/config/route.ts`
- Test: `__tests__/security/api-permission-boundaries.test.ts`

**Interfaces:**
- Preserves: `GET(request: NextRequest)` from `src/app/api/products/route.ts`.
- Removes: public `POST(request: NextRequest)` and all legacy config handlers.
- Canonical replacements: `POST /api/admin/products` and `GET/PUT /api/admin/system-config/parameters`.

- [ ] **Step 1: Remove only the public product POST handler**

In `src/app/api/products/route.ts`, delete from:

```typescript
// 创建商品（管理员）
export async function POST(request: NextRequest) {
```

through the matching end of that function. Keep the imports needed by GET, the GET handler, its query behavior, and its response unchanged.

- [ ] **Step 2: Delete the legacy config route**

Delete exactly:

```text
src/app/api/admin/config/route.ts
```

Do not add a replacement file, redirect, re-export, or compatibility handler.

- [ ] **Step 3: Run the contract test and inspect the remaining failure**

Run:

```powershell
& ".\node_modules\.bin\vitest.cmd" run __tests__/security/api-permission-boundaries.test.ts
```

Expected: the public-product and legacy-config assertions PASS; the three middleware mapping cases still FAIL. The canonical system-parameter assertion must PASS.

### Task 3: Add Failing Middleware Role-Matrix Tests

**Files:**
- Modify: `__tests__/middleware.test.ts`
- Inspect: `src/middleware.ts`

**Interfaces:**
- Consumes: existing `createMockRequest`, `createToken`, and mocked `NextResponse`.
- Produces: behavior tests proving the three active admin prefixes are covered by middleware without widening route-level write authorization.

- [ ] **Step 1: Remove the obsolete config exception test**

Delete this complete test:

```typescript
it('有效 token + 路径不在 pathRoleMap 中仍放行（路由内自行鉴权）', () => {
  // /api/admin/config 不在 pathRoleMap 中
  const token = createToken({ userId: 'u1', phone: '138', role: 'super_admin' })
  const req = createMockRequest('/api/admin/config', `Bearer ${token}`)
  const res = middleware(req) as { status: number }
  expect(res.status).toBe(200)
})
```

Do not replace it with another unmapped admin-path allow-list assertion; the approved security direction is to map every active top-level admin group.

- [ ] **Step 2: Add the approved middleware matrix tests**

Inside the existing middleware `describe`, add:

```typescript
const adminRoles = [
  'super_admin',
  'goods_admin',
  'finance_admin',
  'support_admin',
  'auditor',
] as const

it.each([
  '/api/admin/dashboard/summary',
  '/api/admin/roles',
  '/api/admin/role-permissions',
])('普通用户访问新增映射 %s 返回 403', (pathname) => {
  const token = createToken({ userId: 'u-user', phone: '138', role: 'user' })
  const req = createMockRequest(pathname, `Bearer ${token}`)
  const res = middleware(req) as { status: number }

  expect(res.status).toBe(403)
})

it.each(
  adminRoles.flatMap(role => [
    [role, '/api/admin/dashboard/summary'],
    [role, '/api/admin/roles'],
    [role, '/api/admin/role-permissions'],
  ] as const)
)('%s 通过新增映射访问 %s', (role, pathname) => {
  const token = createToken({ userId: `u-${role}`, phone: '138', role })
  const req = createMockRequest(pathname, `Bearer ${token}`)
  const res = middleware(req) as { status: number }

  expect(res.status).toBe(200)
})
```

Place `adminRoles` at describe scope after `beforeEach`, not inside an individual test.

- [ ] **Step 3: Run the middleware tests and confirm they fail for the intended reason**

Run:

```powershell
& ".\node_modules\.bin\vitest.cmd" run __tests__/middleware.test.ts
```

Expected: the new ordinary-user cases FAIL because unmapped admin paths currently pass through middleware; existing tests and valid-admin cases remain green.

### Task 4: Complete Middleware Coverage

**Files:**
- Modify: `src/middleware.ts`
- Test: `__tests__/middleware.test.ts`
- Test: `__tests__/security/api-permission-boundaries.test.ts`

**Interfaces:**
- Produces middleware mappings that accept the five existing admin roles at the top-level filter.
- Preserves route-level `verifyPermission(['super_admin'])` as the final PUT authorization for roles and role-permissions.

- [ ] **Step 1: Add the three exact path mappings**

In `pathRoleMap`, add:

```typescript
'/api/admin/dashboard': ['super_admin', 'finance_admin', 'goods_admin', 'support_admin', 'auditor'],
'/api/admin/roles': ['super_admin', 'finance_admin', 'goods_admin', 'support_admin', 'auditor'],
'/api/admin/role-permissions': ['super_admin', 'finance_admin', 'goods_admin', 'support_admin', 'auditor'],
```

Remove the leading `+` characters when inserting. Keep the existing longest-prefix matching logic unchanged.

- [ ] **Step 2: Run both targeted test files**

Run:

```powershell
& ".\node_modules\.bin\vitest.cmd" run __tests__/middleware.test.ts __tests__/security/api-permission-boundaries.test.ts
```

Expected: both files PASS with zero failing tests.

- [ ] **Step 3: Confirm every admin write-route file has a final authorization boundary**

Run:

```powershell
$routeFiles = Get-ChildItem -Recurse -Filter route.ts ".\src\app\api\admin"
$missing = foreach ($file in $routeFiles) {
  $content = [System.IO.File]::ReadAllText($file.FullName)
  if (
    $content -match 'export async function (POST|PUT|PATCH|DELETE)' -and
    $content -notmatch 'verifyPermission'
  ) {
    $file.FullName
  }
}
$missing
if ($missing.Count -gt 0) { exit 1 }
```

Expected: no paths printed and exit code 0.

- [ ] **Step 4: Confirm every active admin top-level route group is mapped**

Run:

```powershell
$adminRoot = (Resolve-Path ".\src\app\api\admin").Path
$routeFiles = Get-ChildItem -Recurse -Filter route.ts $adminRoot
$prefixes = $routeFiles |
  ForEach-Object {
    $relative = $_.FullName.Substring($adminRoot.Length + 1)
    ($relative -split '[\\/]')[0]
  } |
  Sort-Object -Unique
$middleware = [System.IO.File]::ReadAllText((Resolve-Path ".\src\middleware.ts"))
$unmapped = foreach ($prefix in $prefixes) {
  if ($middleware -notmatch [regex]::Escape("'/api/admin/$prefix'")) {
    $prefix
  }
}
$unmapped
if ($unmapped.Count -gt 0) { exit 1 }
```

Expected: no prefixes printed and exit code 0.

### Task 5: Full Verification and Handoff

**Files:**
- Verify only; do not edit files to silence unrelated failures.

**Interfaces:**
- Produces: evidence package for 小酷 review and later 小M independent review.

- [ ] **Step 1: Run the full test suite**

Run:

```powershell
& ".\node_modules\.bin\vitest.cmd" run
```

Expected: all test files and tests PASS.

- [ ] **Step 2: Run TypeScript validation**

Run:

```powershell
& ".\node_modules\.bin\tsc.cmd" --noEmit --project tsconfig.typecheck.json
```

Expected: exit code 0 and no TypeScript errors.

- [ ] **Step 3: Run the production build**

Run:

```powershell
& ".\node_modules\.bin\next.cmd" build
```

Expected: exit code 0 and successful production build. Record any existing “Skipping linting” message as a known project condition, not a Batch 2 success.

- [ ] **Step 4: Verify the exact working-tree scope**

Run:

```powershell
git status --short
git diff --name-status
git diff --cached --name-status
git diff -- src/app/api/products/route.ts src/app/api/admin/config/route.ts src/middleware.ts __tests__/middleware.test.ts __tests__/security/api-permission-boundaries.test.ts
```

Expected Batch 2 changes:

```text
M  src/app/api/products/route.ts
D  src/app/api/admin/config/route.ts
M  src/middleware.ts
M  __tests__/middleware.test.ts
?? __tests__/security/api-permission-boundaries.test.ts
```

The pre-existing unrelated changes remain visible but unchanged. The cached diff must be empty.

- [ ] **Step 5: Return the structured execution report**

Report:

1. Three-state result: passed / conditionally passed / failed.
2. Baseline HEAD: `1633328938a521f73ddef300fdd14129f52ddf54`.
3. Exact changed and deleted files.
4. Red-to-green evidence for each targeted test stage.
5. Full Vitest, typecheck, and build results with exit codes and test counts.
6. Write-route authorization scan result.
7. Admin top-level mapping scan result.
8. Confirmation that protected files were not changed by this task.
9. Confirmation of no staging, commit, push, deployment, or database write.
10. Any remaining risk or unexpected repository state.

Stop after reporting. Do not stage or commit; 小酷 must inspect the implementation before the mandatory 小M review.
