# 用户侧接口鉴权加固 · 设计方案

> 负责人：小酷（Codex）
> 分级：P 级（权限/安全）
> 状态：设计稿，待胡子老师批准后方可实现

---

## 1. 背景与目标

当前 `src/middleware.ts`（第 88-91 行）只对 `/api/admin/*` 做 JWT 签名 + 角色校验，**用户侧接口（`/api/orders`、`/api/withdrawals`、`/api/points`、`/api/user/*`、`/api/rewards` 等）第一道无 middleware 保护**，仅靠各路由内 `verifyPermission` 兜底。一旦某路由漏写校验即"裸奔"。

**目标**：在 middleware 给用户侧接口补一道**登录校验**（仅校验 JWT 有效性，不改业务规则），形成"双保险"，与 admin 侧一致。

## 2. 关键设计决策（待胡子老师确认）

| 决策点 | 建议方案 | 需确认 |
|---|---|---|
| 加固方式 | middleware 对用户侧路径做**仅登录校验**（验 JWT 签名 + 过期），不做角色细分 | 是否仅登录校验？ |
| 覆盖路径 | `/api/orders`、`/api/withdrawals`、`/api/points`、`/api/user/*`、`/api/rewards`、`/api/cart`、`/api/notifications`、`/api/regions` 等 | 具体覆盖哪些？ |
| 与路由内校验关系 | 保留各路由 `verifyPermission`（第二道），middleware 只做"未登录 401"第一道拦截 | 是否保留双保险？ |
| 豁免路径 | 登录 / 注册 / 忘记密码 / 公开商品等不需登录的接口 | 哪些豁免？ |

> 原则：middleware 只做"是否登录"的粗校验，业务权限（谁能看谁的订单）仍由路由内校验负责，避免在 middleware 引入业务复杂度。

## 3. 影响范围

| 文件 | 改动 | 说明 |
|---|---|---|
| `src/middleware.ts` | 增加用户侧路径的登录校验分支 | 核心 |
| `__tests__/middleware.test.ts` | 补用户侧路径的 401/200 用例 | TDD |

## 4. 风险与边界

- **误伤风险**：某些接口可能被匿名访问（如公开商品列表、地区列表），须明确豁免，不能一刀切。
- **重复校验**：路由内 `verifyPermission` 已验签，middleware 再验一次属"双保险"，但须确认 Edge/Node runtime 下 `JWT_SECRET` 可读（v55.2 已设 `runtime='nodejs'`，一致）。
- **不改变业务规则**：仅加"未登录 401"，不新增任何权限判定。

## 5. 测试计划（TDD）

- 用户侧路径无 token → 401。
- 无效 / 过期 token → 401。
- 有效 token → 放行（进入路由内校验）。
- 豁免路径（公开接口）无 token → 200。

## 6. 发布流程（P 级）

小酷实现（TDD）→ 小酷自审 → **小M 独立只读复审（强制）** → **胡子老师关键链路验收** → 精确暂存 push → `git log origin/main --oneline -1` 核对 → Vercel Ready 核对 → 胡子老师线上验收。

---

> 本设计待胡子老师批准（尤其第 2 节覆盖路径与豁免）后进入实现；未经批准不改代码。
