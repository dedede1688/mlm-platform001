# Batch 2 API 权限收口设计

**日期：** 2026-07-25
**级别：** P 级（权限）
**状态：** 胡子老师已批准接口边界与验收设计，待书面终审

## 1. 目标

删除重复且不安全的写入口，补齐管理端 API 的双层权限防线，并用自动化测试防止同类问题回归。

本批完成后：

- `/api/products` 只提供公开商品读取，不再接受商品创建。
- 商品写操作统一进入 `/api/admin/products/**`。
- 旧 `/api/admin/config` 完全删除。
- 系统参数统一由 `/api/admin/system-config/parameters` 管理。
- 所有现用管理端顶级接口均进入 middleware 角色映射，并继续保留路由内 `verifyPermission` 最终鉴权。

## 2. 已确认现状

- `src/app/api/products/route.ts` 同时导出 GET 和未鉴权 POST。
- 前台商品页面只调用 `/api/products` GET，未发现仓库内 POST 调用方。
- `src/app/api/admin/products/route.ts` 已提供受 `goods_admin`、`super_admin` 保护的商品创建接口，并包含参数校验和操作日志。
- `src/app/api/admin/config/route.ts` 使用 `verifyToken + level >= 7`，未使用现行角色权限工具。
- 未发现仓库内 `/api/admin/config` 调用方。
- `src/app/api/admin/system-config/parameters/route.ts` 已提供受 `super_admin` 保护的系统参数读写接口。
- 当前 60 个管理端路由文件中，36 个包含 POST、PUT、PATCH 或 DELETE；除待删除的旧 config 外，其余写路由文件均使用 `verifyPermission`。
- middleware 的 `pathRoleMap` 尚未列出 `dashboard`、`roles`、`role-permissions`；这些路由目前依靠路由内 `verifyPermission` 鉴权。

仓库内零调用不能证明仓库外没有调用方。胡子老师已明确拍板：不保留旧 config 兼容入口，直接删除。

## 3. 方案选择

### 方案 A：最小修补

只删除公开商品 POST 和旧 config。改动最少，但 middleware 仍存在未映射的现用管理端接口，也缺少系统性防回归测试。

### 方案 B：权限收口与自动化守门（采用）

删除两个重复入口，补齐 middleware 映射，并新增接口边界和角色矩阵测试。该方案覆盖已确认风险，范围集中，不引入新的鉴权架构。

### 方案 C：全面鉴权封装重构

将全部管理端路由迁移到新的统一高阶鉴权函数。长期形式更统一，但会扩大 P 级改动面，增加现有 60 个路由的回归风险，不适合本批。

## 4. 接口边界

### 4.1 公开商品接口

- 保留 `GET /api/products`。
- 删除 `src/app/api/products/route.ts` 中的 POST 导出及其商品创建逻辑。
- 删除后 `POST /api/products` 由 Next.js 返回 `405 Method Not Allowed`。
- 不增加兼容转发，不在公开路由内补管理员鉴权。

### 4.2 后台商品接口

- 商品新增继续使用 `POST /api/admin/products`。
- 商品修改、删除和批量操作继续使用现有 `/api/admin/products/**`。
- 允许角色保持 `goods_admin`、`super_admin`，不扩大角色范围。
- 不修改后台商品页面和商品数据结构。

### 4.3 系统参数接口

- 删除 `src/app/api/admin/config/route.ts`。
- `GET/PUT /api/admin/config` 删除后返回 404。
- 系统参数统一使用 `GET/PUT /api/admin/system-config/parameters`。
- 允许角色保持 `super_admin`。
- 不提供重定向、代理或兼容响应。

## 5. 双层鉴权

middleware 负责 JWT 签名和顶级路径角色粗筛；各 API 路由的 `verifyPermission` 负责查库并按具体方法进行最终授权。

在 `src/middleware.ts` 的 `pathRoleMap` 增加：

- `/api/admin/dashboard`：`super_admin`、`goods_admin`、`finance_admin`、`support_admin`、`auditor`。
- `/api/admin/roles`：上述五类管理员。
- `/api/admin/role-permissions`：上述五类管理员。

`roles` 和 `role-permissions` 的 GET 允许五类管理员读取，PUT 仍由路由内 `verifyPermission(['super_admin'])` 限定。middleware 不替代路由内鉴权，也不扩大任何写权限。

## 6. 错误行为

- 未登录或令牌无效访问受保护管理端接口：middleware 返回 401。
- 令牌有效但角色不在顶级路径白名单：middleware 返回 403。
- 通过 middleware 但不满足具体方法权限：路由内返回 403。
- `POST /api/products`：405。
- `GET/PUT /api/admin/config`：404。

现有响应格式不在本批统一，避免扩大范围。

## 7. 测试设计

采用 TDD，先提交能证明风险的失败测试，再做最小实现。

### 7.1 路由边界测试

- 断言公开商品 route 不再导出 POST。
- 断言 GET 仍存在，避免误删公开读取能力。
- 断言旧 config route 文件不存在，且项目源码不再引用 `/api/admin/config`。
- 断言系统参数 route 仍导出 GET、PUT，并使用 `verifyPermission(['super_admin'])`。

测试应验证外部可观察边界，不复制业务实现。

### 7.2 middleware 权限矩阵

扩充 `__tests__/middleware.test.ts`：

- 五类管理员访问 `/api/admin/dashboard/summary` 均通过 middleware。
- 普通用户访问 dashboard 被拒绝。
- 五类管理员访问 `/api/admin/roles` 和 `/api/admin/role-permissions` 均通过 middleware。
- 普通用户访问 roles 和 role-permissions 被拒绝。
- 删除原先把 `/api/admin/config` 当作“未映射路径仍放行”的测试，改用一个明确保留且无角色映射的测试路径验证该通用行为，或直接删除与现行安全目标冲突的断言。

路由级 PUT 权限由现有 `verifyPermission` 逻辑保持，不在 middleware 测试中伪装成最终授权。

### 7.3 全量验证

按顺序运行：

1. 新增或修改的定向测试。
2. `.\node_modules\.bin\vitest.cmd run`
3. `.\node_modules\.bin\tsc.cmd --noEmit --project tsconfig.typecheck.json`
4. `.\node_modules\.bin\next.cmd build`

全部必须退出码为 0。无 UI 变化，因此本批不要求浏览器截图。

## 8. 变更范围

预计修改：

- `src/app/api/products/route.ts`
- `src/middleware.ts`
- `__tests__/middleware.test.ts`
- 与路由边界测试对应的新测试文件

预计删除：

- `src/app/api/admin/config/route.ts`

不得修改：

- Prisma schema、migration 和生产数据库。
- 角色名称、角色业务权限及后台菜单。
- 管理页面 UI。
- 与本批无关的 API、服务和公共响应格式。
- 当前工作区已有的 `package.json`、`src/lib/logger.ts`、`docs/项目清单.md`、`.workbuddy/memory/*` 变化。

## 9. 执行与审核流程

1. 小酷完成本设计并由胡子老师终审。
2. 小酷编写自包含的小猫执行提示词；提示词在对话中交付，不落项目文件。
3. 胡子老师转发给小猫执行。
4. 小酷核对实际差异、测试输出和受保护文件。
5. 小酷编写小M独立只读复审提示词。
6. 胡子老师转发给小M复审；结论必须为通过、有条件通过或不通过，并附文件与行号证据。
7. 小酷核实复审意见；未通过前不得提交业务改动。
8. 胡子老师完成关键权限链路验收后，才进入精确暂存、提交、推送和部署核验。

## 10. 完成标准

- 两个重复写入口均已删除。
- 后台商品和系统参数的唯一入口保持可用且权限不放宽。
- 三组管理端接口补入 middleware 映射。
- 路由内 `verifyPermission` 最终防线保持完整。
- 定向测试、完整测试、typecheck、build 全部通过。
- 小M独立复审通过。
- 受保护的既有工作区变化未被覆盖、恢复或混入提交。
- 未经胡子老师授权不推送、不部署。
