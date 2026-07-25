# Batch 5A-1 公开商品写接口封堵设计文档

## 1. 文档状态

- 日期：2026-07-25
- 任务批次：Batch 5A-1
- 任务名称：公开商品写接口封堵
- 任务级别：P 级（权限边界 + 商品写操作）
- 当前状态：设计文档，待胡子老师确认
- 设计角色：小酷
- 后续执行建议：小猫执行，小M只读复审，胡子老师验收

## 2. 背景结论

Batch 5A 权限剩余项只读审计发现，治理总表旧问题 C-3 的表述已经过期：

- `src/app/api/products/route.ts` 当前只有公开 `GET`，没有公开 `POST`。
- 真实风险不在 `/api/products` 的 `POST`，而在 `/api/products/[id]` 的公开写接口。

当前真实源码事实：

- `src/app/api/products/[id]/route.ts` 存在公开 `GET`。
- 同一文件还存在公开 `PUT` 和公开 `DELETE`。
- `PUT` 直接调用 `prisma.product.update`。
- `DELETE` 直接调用 `prisma.product.delete`。
- 该公开路由没有 `verifyPermission`。
- 该公开路由没有 `verifyToken`。
- 该公开路由不在 `/api/admin/*` 下，不能被 admin API 的 middleware 角色映射兜住。

因此，当前风险不是“普通用户能不能看到商品”，而是“外部请求是否可能绕过后台直接改商品或删除商品”。

## 3. 风险定级

本任务定为 P 级，原因如下：

1. 商品属于平台核心经营数据。
2. 商品价格、库存、上下架状态、升级商品属性都会影响交易和会员权益。
3. 公开 `DELETE` 当前是硬删除风险，破坏性高于普通状态变更。
4. 这是权限边界问题，不能只靠前端页面入口控制。

## 4. 目标

本批次目标只有一个：把公开商品 API 收敛为只读。

完成后应满足：

1. `/api/products` 保留公开 `GET`，用于商城商品列表。
2. `/api/products/[id]` 保留公开 `GET`，用于商城商品详情。
3. `/api/products/[id]` 不再提供公开 `PUT`。
4. `/api/products/[id]` 不再提供公开 `DELETE`。
5. 所有商品新增、编辑、删除、复制、批量上下架继续走 `/api/admin/products/*`。
6. 后台商品写接口继续使用 `verifyPermission(request, ['goods_admin', 'super_admin'])`。
7. 不做数据库 migration。
8. 不修改商品业务字段。
9. 不调整商品后台 UI。
10. 不调整角色体系，角色权限细化放入 Batch 5A-2。

## 5. 非目标

本批次不处理以下内容：

1. 不重构商品服务层。
2. 不改变后台商品管理页面交互。
3. 不新增商品审核流。
4. 不修改商品表结构。
5. 不清理历史商品数据。
6. 不处理 support_admin / goods_admin / finance_admin 的操作级权限差异。
7. 不处理 middleware unmatched admin route 默认放行问题。
8. 不处理 `points_admin` 孤儿角色问题。

这些问题会拆到后续 Batch 5A-2、Batch 5A-3 或权限角色整理批次。

## 6. 推荐方案

### 6.1 核心方案

从 `src/app/api/products/[id]/route.ts` 删除公开 `PUT` 和公开 `DELETE` 导出，只保留公开 `GET`。

推荐结果：

```ts
export async function GET(...)
```

不再存在：

```ts
export async function PUT(...)
export async function DELETE(...)
```

### 6.2 为什么不是给公开路由补鉴权

不推荐把 `verifyPermission` 加到 `/api/products/[id]` 的 `PUT/DELETE` 上，原因：

1. 后台已有受保护写入口：`/api/admin/products/[id]`。
2. 保留两套写入口会增加长期维护成本。
3. 两套入口容易出现字段校验、操作日志、软删除策略不一致。
4. 公开路径天然应保持读接口语义，写操作统一放进 admin 命名空间更干净。

### 6.3 为什么不是显式返回 405

Next.js App Router 对没有导出的 HTTP method 会按不支持方法处理。
本批次建议直接删除 handler，而不是保留一个显式 `405` handler。

原因：

1. 删除 handler 更清晰，源码上看不到公开写入口。
2. 不需要维护额外响应格式。
3. 测试可以直接断言模块没有导出 `PUT` / `DELETE`。
4. 后台写入口已经存在，不需要在公开路由里做兼容。

如果后续小M认为线上行为必须强断言 HTTP 405，可以在实施计划中补一个 route handler 行为测试；但设计主线仍是“公开路由不保留写方法”。

## 7. 现有后台安全入口

本批次不新建后台写接口，因为现有后台入口已经覆盖核心写操作：

| 功能 | 现有入口 | 鉴权 |
|---|---|---|
| 商品列表/后台读取 | `src/app/api/admin/products/route.ts` GET | `verifyPermission(['goods_admin', 'super_admin'])` |
| 新建商品 | `src/app/api/admin/products/route.ts` POST | `verifyPermission(['goods_admin', 'super_admin'])` |
| 商品详情/后台读取 | `src/app/api/admin/products/[id]/route.ts` GET | `verifyPermission(['goods_admin', 'super_admin'])` |
| 编辑商品 | `src/app/api/admin/products/[id]/route.ts` PUT | `verifyPermission(['goods_admin', 'super_admin'])` |
| 删除商品 | `src/app/api/admin/products/[id]/route.ts` DELETE | `verifyPermission(['goods_admin', 'super_admin'])` |
| 复制商品 | `src/app/api/admin/products/[id]/duplicate/route.ts` POST | `verifyPermission(['goods_admin', 'super_admin'])` |
| 批量操作 | `src/app/api/admin/products/bulk/route.ts` POST | `verifyPermission(['goods_admin', 'super_admin'])` |

特别注意：

- 当前公开 `DELETE` 使用 `prisma.product.delete`，属于硬删除。
- 后台 `DELETE` 使用后台受控路径，且当前实现更符合后台管理语义。
- 所以公开 `DELETE` 应直接移除，不应迁移或保留。

## 8. 实施边界

允许修改：

1. `src/app/api/products/[id]/route.ts`
2. 商品公开路由相关测试文件
3. 商品后台路由相关测试文件

原则上不修改：

1. `src/app/api/admin/products/**`
2. `src/lib/admin-menu.ts`
3. `src/lib/admin-permissions.ts`
4. `src/middleware.ts`
5. `prisma/schema.prisma`
6. 任意 migration 文件
7. 任意生产数据

如果实施时发现前端仍调用公开 `PUT/DELETE`，必须暂停汇报，不得私自扩大范围重构。

## 9. 执行前必须核查

小猫执行前必须先做只读核查：

```powershell
git status --short --branch
git diff --name-status
git diff --cached --name-status
git log -5 --oneline
```

确认工作区干净或仅存在胡子老师已授权的改动后，再继续。

还必须核查公开写接口和后台写入口：

```powershell
rg -n "export async function (GET|POST|PUT|DELETE)|verifyPermission|prisma\.product\.(update|delete|create)" "src/app/api/products" "src/app/api/admin/products"
```

还必须核查是否有前端调用公开商品写接口：

```powershell
rg -n "/api/products|method:\s*['""]PUT['""]|method:\s*['""]DELETE['""]" src
```

判断标准：

- 商城前端读取 `/api/products` 或 `/api/products/[id]` 是允许的。
- 任何前端对 `/api/products/[id]` 发 `PUT` 或 `DELETE` 都是本批次阻断前必须上报的风险。
- 后台对 `/api/admin/products/*` 发写请求是允许的。

## 10. 测试设计

建议新增或补充 API route 测试，优先放在商品 API 相关测试文件中；如果当前没有合适文件，可新建：

```text
__tests__/api/products-public-route.test.ts
```

建议覆盖以下测试：

### 10.1 公开商品详情仍可读取

目的：确保删除公开写方法不会破坏商城详情页。

断言：

- `GET /api/products/[id]` handler 仍存在。
- 能正常返回商品数据。
- 不要求 admin token。

### 10.2 公开商品详情不再导出 PUT

目的：源码级锁住公开写入口。

断言：

```ts
expect('PUT' in productDetailRouteModule).toBe(false)
```

### 10.3 公开商品详情不再导出 DELETE

目的：源码级锁住公开删除入口。

断言：

```ts
expect('DELETE' in productDetailRouteModule).toBe(false)
```

### 10.4 后台商品写入口仍要求权限

目的：证明写能力没有消失，只是回到后台安全入口。

建议断言：

- `/api/admin/products/route.ts` POST 调用 `verifyPermission(request, ['goods_admin', 'super_admin'])`
- `/api/admin/products/[id]/route.ts` PUT 调用 `verifyPermission(request, ['goods_admin', 'super_admin'])`
- `/api/admin/products/[id]/route.ts` DELETE 调用 `verifyPermission(request, ['goods_admin', 'super_admin'])`

如果已有后台商品 route 测试，只补断言，不重复造大测试。

## 11. 验证命令

小猫执行完成后必须跑：

```powershell
.\node_modules\.bin\vitest.cmd run
.\node_modules\.bin\tsc.cmd --noEmit --project tsconfig.typecheck.json
.\node_modules\.bin\prisma.cmd validate
.\node_modules\.bin\prisma.cmd generate
.\node_modules\.bin\next.cmd build
git diff --check
git diff --cached --check
```

还必须跑安全扫描：

```powershell
Select-String -LiteralPath ".\src\app\api\products\[id]\route.ts" -Pattern "export async function (PUT|DELETE)|prisma\.product\.(update|delete)|verifyPermission|verifyToken"
```

预期：

- 不应命中 `export async function PUT`
- 不应命中 `export async function DELETE`
- 不应命中 `prisma.product.update`
- 不应命中 `prisma.product.delete`
- 不要求命中 `verifyPermission`，因为公开路由应只读，不应保留写方法

后台入口扫描：

```powershell
Select-String -LiteralPath ".\src\app\api\admin\products\route.ts",".\src\app\api\admin\products\[id]\route.ts" -Pattern "verifyPermission"
```

预期：

- 后台 POST / PUT / DELETE 所在文件仍保留 `verifyPermission`。

## 12. 验收标准

代码验收：

1. `src/app/api/products/[id]/route.ts` 只保留公开 `GET`。
2. 公开商品详情路由不再有 `PUT` / `DELETE` 导出。
3. 公开商品详情路由不再直接调用 `prisma.product.update`。
4. 公开商品详情路由不再直接调用 `prisma.product.delete`。
5. 后台商品写入口仍存在且仍使用 `verifyPermission(['goods_admin', 'super_admin'])`。
6. 全量测试、typecheck、Prisma validate/generate、build 全绿。

人工验收：

1. 商城商品列表能打开。
2. 商城商品详情能打开。
3. 后台商品管理能打开。
4. 后台超级管理员或商品管理员仍能编辑商品。
5. 未登录或普通用户不能通过公开商品详情 API 修改或删除商品。

如果需要人工验证，只建议做一条最小验证：

```text
登录普通会员账号后，打开商城商品详情，确认能看商品；
不要点后台；
把商品详情页截图回传。
```

API 级未授权 `PUT/DELETE` 可由小猫用本地测试或脚本验证，不建议让胡子老师手工构造请求。

## 13. 小M复审重点

小M只读复审时重点查：

1. 公开 `/api/products/[id]` 是否已经没有 `PUT` / `DELETE` 导出。
2. 公开 `/api/products/[id]` 是否已经没有商品写数据库调用。
3. 后台 `/api/admin/products/*` 写入口是否仍保留鉴权。
4. 是否误删公开 GET，导致商城详情页受影响。
5. 是否引入重复写入口。
6. 是否把 Batch 5A-2 的角色操作级权限问题混入本批次。
7. 是否有 migration、生产数据库写入或无关文件改动。

## 14. 回滚方案

如果上线后发现商城前端依赖公开 `PUT/DELETE`，说明前端存在不合理调用，应先回滚本批次或临时恢复，再单独排查调用方。

推荐回滚方式：

```powershell
git revert <Batch 5A-1 implementation commit>
```

回滚后必须立刻重新评估：

1. 是哪个前端页面调用了公开写接口。
2. 该调用是否应迁移到 `/api/admin/products/*`。
3. 是否存在更大的权限模型缺陷。

## 15. 后续批次衔接

Batch 5A-1 完成后，建议继续：

1. Batch 5A-2：后端操作级权限收口，重点处理 `support_admin` 可直接调用余额、积分、密码等敏感接口的问题。
2. Batch 5A-3：middleware 对未匹配的 `/api/admin/*` 默认拒绝，避免未来新 admin API 漏映射。
3. Batch 5A-4：整理 `points_admin` 等孤儿角色和前后端角色清单一致性。

本批次只处理最直接、最清楚、风险最高的公开商品写入口。
