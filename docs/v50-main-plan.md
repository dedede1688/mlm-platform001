# MLM Platform 执行计划 v50 — 主项目计划

> **版本**: v50
> **生成时间**: 2026-06-26
> **依据**: 业务规则需求文档（v2 终版，胡子哥 2026-06-23 凌晨 1:46 确认）
> **替代**: v47 系统优化、v48 综合优化、v49 工程版（已归档至 `docs/归档/计划/`）
> **组织方式**: 按文件/模块聚合（v49 优点）+ 以 v2 业务规则为依据（v47/v48 失败教训）

---

## 📋 文档导航

| 文档 | 路径 | 用途 |
|------|------|------|
| **本文件** | `docs/执行计划-v50-主项目计划.md` | **唯一执行计划**——所有派单以此为准 |
| 项目清单 | `docs/项目清单.md` | 所有待办任务的状态/来源/工期 |
| 业务规则（v2） | `docs/业务规则需求文档.md` | **需求唯一依据**——所有任务必须对齐 v2 决策 |
| v43-7 设计 | `docs/v43-7-design.md` | 4 字段余额体系设计依据（分红部分已 v2 改写，仅参考）|
| 现状调研 | `docs/现状调研-订单收益退款.md` | 调研数据有效（分红部分已 v2 改写，仅参考）|
| 历史计划归档 | `docs/归档/计划/` | v47/v48/v49 等过期计划，**禁止再使用** |
| 历史派单归档 | `docs/派单历史/` | 已完成任务的派单存档（27 份，参考价值）|

---

## 📊 项目当前状态（2026-06-26 梳理）

### 业务 v2 决策实现度

| v2 决策 | 状态 | 关键证据 |
|---------|------|---------|
| 直推奖 20% + A 买过升级品 | ✅ 已实现 | `reward.service.ts:55-64` |
| 品牌管理奖 v4（安置链 + 轮换 + 沉淀 + 层数限制）| ✅ 已实现 | `reward.service.ts:108-183` |
| 升级条件 v2（仅销售额）| ✅ 已实现 | `user.service.ts:143` |
| 升级积分公式（箱数 × 积分/箱）| ✅ 已实现 | `user.service.ts:156-164` |
| **分红 5 级独立池** | ❌ 未实现 | `dividend.service.ts:120-146`（v1 累加算法）|
| **团队奖清理** | 🟡 决策定，UI 没清 | 4 处代码残留 |
| **v2 22 项配置** | 🟡 只 4/22 | `system-parameters.ts:4-7` |
| **释放规则百分比** | ❌ 未实现 | `points.service.ts` 缺 |
| **前端会员双轨制** | ❌ 未实现 | `dashboard/page.tsx:380` 只有文字 |
| **Toast 提示（推荐奖未解锁）** | ❌ 未实现 | `reward.service.ts:62` 只有 logger |

### 已完成体系（不再做）

- ✅ 通知系统（v46.4-v46.12，11 commit）
- ✅ v43-7 4 字段余额体系（v43-7 Batch 2.2.a-g）
- ✅ 流水页 + 类型 tab（v53a-v53d）
- ✅ 退款完成路由（v54a）
- ✅ v52 升级规则 bug 修复
- ✅ v45.7.2 测试覆盖 4 个 service
- ✅ v45.5 CI lint + typecheck
- ✅ v45.8 coverage threshold
- ✅ v52 业务重写 + 品牌管理奖 v4 完整实现
- ✅ v47 业务规则 v2 改造（直推奖 + 品牌管理奖 + 升级条件）

### Service 现状（11 个 service 文件）

| Service | 行数 | 拆分候选 |
|---------|------|---------|
| `order.service.ts` | **720+ 行**（26KB）| 🔴 **必须拆** |
| `reward.service.ts` | 470 行（14KB）| 🟡 建议拆（直推/品牌/分红/退款扣回 4 个子职责）|
| `dividend.service.ts` | 354 行（10KB）| 🟢 暂不拆（v2 重写后再评估）|
| `withdrawal.service.ts` | 340 行（10KB）| 🟢 暂不拆 |
| `points.service.ts` | 293 行（9KB）| 🟢 不拆 |
| `admin.service.ts` | 250 行（7KB）| 🟢 不拆 |
| `user.service.ts` | 234 行（6KB）| 🟢 不拆 |
| `notification.service.ts` | 120 行 | 🟢 不拆 |
| 其他 3 个 | < 50 行 | 🟢 不拆 |

---

## 🎯 v50 任务总览（16 个 Group）

### 🔴 P0：v2 业务核心（业务不完整，9 个任务）

| Group | 文件 | 任务 | 工期 | v2 决策 |
|-------|------|------|------|---------|
| **A** | `lib/services/reward.service.ts` + `app/dashboard/rewards/page.tsx` + `app/admin/finance/page.tsx` + `prisma/seed.ts` | 团队奖清理（4 处代码）| 4h | §2.3 |
| **B** | `lib/services/dividend.service.ts` + `lib/config/business.ts` + `prisma/seed.ts` | **分红 5 级独立池**改造 | 3-4 天 | §2.4 |
| **C** | `lib/config/system-parameters.ts` + `prisma/seed.ts` + `app/admin/settings/system-parameters/page.tsx` | **v2 22 项配置**补全 | 1-2 天 | §8.1 |
| **D** | `lib/services/points.service.ts` + `lib/config/business.ts` | **释放规则百分比** + 天数自动算 | 1 天 | §6.1 |
| **E** | `app/dashboard/page.tsx` + `app/api/auth/me/route.ts` | **前端会员双轨制** UI | 1 天 | §5.1-5.2 |
| **F** | `app/dashboard/rewards/page.tsx` + `lib/services/reward.service.ts` | **推荐奖未解锁 Toast** | 半天 | §5.3 |
| **G** | `lib/services/reward.service.ts` | 品牌管理奖 v4 细节优化（轮换起始位）| 半天 | §2.2 |
| **H** | `lib/services/user.service.ts` | 升级品订单计入销售额验证 | 半天 | §7.4 |
| **I** | `app/dashboard/rewards/page.tsx` + `lib/services/reward.service.ts` | description 4 字段标签（v2.4 派单遗留）| 2h | v2.4 派单 |

### 🟡 P1：v47 安全+体验（独立于 v2 业务，4 个任务）

| Group | 文件 | 任务 | 工期 | 来源 |
|-------|------|------|------|------|
| **J** | `app/api/admin/**/*.ts` | 角色权限白名单统一修复 | 半天 | v47 1.2 |
| **K** | `app/payment/order/[orderId]/page.tsx` + `app/dashboard/orders/page.tsx` + `app/dashboard/orders/[id]/page.tsx` | 支付密码强制生效（验证 v43-7 Batch 2.1 后是否完全切换）| 半天 | v47 1.1 |
| **L** | `lib/utils/cron.ts` + `vercel.json` | **自动确认收货**挂载到 cron + 限流加固 | 1-2 天 | v47 1.3 + 1.5 |
| **M** | `app/api/admin/refunds/**/*.ts` + `app/admin/refunds/page.tsx` + `lib/services/order.service.ts` | 退款全流程通知补全 + 文案更新 | 1 天 | v47 2.1 + 2.5 |

### 🟢 P2：技术债 + 性能（3 个任务）

| Group | 文件 | 任务 | 工期 | 来源 |
|-------|------|------|------|------|
| **N** | `lib/services/order.service.ts` → 拆 5 个子 service | **OrderService 拆分**（26KB → 5 个子文件）| 2-3 天 | v47 3.1 |
| **O** | `lib/services/reward.service.ts` + 散落 useEffect | 收益明细过滤 refunded + setInterval 内存泄漏扫描 | 1-2 天 | v47 2.7 + v49 A2 |
| **P** | `app/api/admin/notifications/**/*.ts` + 流水页 | earnings_void 独立 type（v2.4 派单遗留）| 2h | v2.4 派单 |

### 总工期估算

| 优先级 | 任务数 | 工期 |
|--------|--------|------|
| 🔴 P0 v2 业务核心 | 9 | 9-12 天 |
| 🟡 P1 安全+体验 | 4 | 3-5 天 |
| 🟢 P2 技术债 | 3 | 3-5 天 |
| **合计** | **16** | **15-22 天** |

---

## 📁 各 Group 详细说明

### Group A：团队奖清理（4 小时）

**依据**: 业务规则 §2.3 — 团队奖 ❌ 完全取消（v2 终版 line 196）

**任务**:
- **A1**: 前端移除团队奖 tab — `app/dashboard/rewards/page.tsx:51`
  - 删 `{ key: 'team', label: '团队奖', ... }`
  - 删 `TYPE_CONFIG.team` (line 63-68)
- **A2**: admin 端移除团队奖卡片 — `app/admin/finance/page.tsx:524-526`
  - 删 `stats.team.total` 显示
  - 删 `stats.team.count` 显示
- **A3**: 删后端 `teamTotal: 0` 硬编码 — `lib/services/reward.service.ts:379`
  - 删 `getUserRewardStats` 返回里的 `teamTotal` 字段
  - 删前端所有 `stats.teamTotal` 引用
- **A4**: 删 seed 配置 — `prisma/seed.ts`
  - 查 `TEAM_REWARD_LEVELS` 配置并删
  - 查 `seedTeamRewards` 调用并删

**验证**:
- [ ] `pnpm build` 0 错误
- [ ] `rg "team|团队奖" src/` 无业务相关引用
- [ ] 用户端 + admin 端都不显示团队奖

---

### Group B：分红 5 级独立池改造（3-4 天）⭐ 核心

**依据**: 业务规则 §2.4 — 分红奖 v2 完全重写

**现状问题**: `dividend.service.ts:120-146` 是 v1 累加算法
```typescript
// v1 累加算法（错）
// 主任每人 = 分红池 / (Z+M+D+P+B)
// 经理每人 = 主任分红 + 分红池 / (M+D+P+B)  // ← 累加！

// v2 5 级独立池（对）
// 主任池 = 订单总额 × 主任池比例（独立）
// 经理池 = 订单总额 × 经理池比例（独立）
// ...
```

**任务**:
- **B1**: 重构 `settleDailyDividends` 算法
  - 改用 5 个独立 `getBusinessConfig` 读取 5 个池比例
  - 改用 5 个独立"包含上级"开关
  - 每个池独立计算（不是累加）
- **B2**: 加 5 个新配置到 system-parameters — `lib/config/system-parameters.ts`
  - `dividend.director.rate` 等 5 个 rate
  - `dividend.director.include_upstream` 等 5 个开关
- **B3**: 更新 v2 举例验证 — 写 E2E 测试覆盖"情况 A"和"情况 B"

**验证**:
- [ ] 5 个池独立计算（不累加）
- [ ] "包含上级"开关生效
- [ ] 业务规则 §2.4 line 240-263 举例全部通过

---

### Group C：v2 22 项配置补全（1-2 天）

**依据**: 业务规则 §8.1 — 20 项业务参数 + §8.2 — 2 项功能开关

**现状**: 只 4 项已实现
- `auto_confirm_days`（自动确认收货）
- `earnings_hold_hours`（收益到账缓冲）
- `refund_window_days`（退款窗口）
- `dividend_period_minutes`（分红周期）

**任务**:
- **C1**: 加 18 项新配置到 `lib/config/system-parameters.ts`
  - 1-2 项: 直推奖 + 品牌管理奖比例（**已通过 getBusinessConfig 走，不在此处**）
  - 3-12 项: 分红 5 池比例 + 5 包含上级开关（**部分与 Group B 重叠**）
  - 13-20 项: 升级条件 6 项 + 积分公式 2 项（**已通过 getBusinessConfig 走，不在此处**）
  - 21-22 项: 积分转赠功能开关 + 手续费
- **C2**: 验证所有 22 项都能后台编辑保存
- **C3**: 升级 admin 系统参数页面 — `app/admin/settings/system-parameters/page.tsx`
  - 加 18 项新配置的编辑 UI

**注意**: 业务规则 §8 列的 22 项里，**奖励/升级相关 10 项走 `getBusinessConfig`（已有）**——**不重复实现**。需要确认的只有 12 项新配置（4 项时间相关已有 + 8 项新增）。

**实际工作量**: 8 项新增配置（与 Group B 重叠 10 项扣除）。

---

### Group D：释放规则百分比 + 天数自动算（1 天）

**依据**: 业务规则 §6.1-6.3

**现状问题**: `points.service.ts` 找不到释放规则配置
- 当前是写死（推测）

**任务**:
- **D1**: 加 `upgrade.daily_unlock_rate` 配置到 `lib/config/business.ts`
  - 默认 0.01（1%/天）
  - 后台可调
- **D2**: 改 `PointsService.dailyUnlock` 算法
  - 用 `100 / 升级.daily_unlock_rate` 算释放天数
  - 不再写死 100 天
- **D3**: 加 1 项配置到 `system-parameters.ts`（如需后台编辑）

**验证**:
- [ ] 改 2%/天 → 50 天释放完
- [ ] 改 0.5%/天 → 200 天释放完

---

### Group E：前端会员双轨制 UI（1 天）

**依据**: 业务规则 §5.1-5.2

**现状**: `dashboard/page.tsx:380` 只有文字「会员价购物、推荐奖20%」

**任务**:
- **E1**: 改 `/dashboard` 个人中心加身份卡片 UI
  - 2 个状态：「未买升级品」+ 「买过升级品」
  - 显示"会员价 ✅ 已开通" + "推荐奖 🔒/✅"
  - 未买时显示「💡 购买 1 件升级品即可解锁推荐奖」
- **E2**: 后端 `/api/users/me` 返回 `hasUpgradeProduct` 字段
  - 查 `user.upgradeProductCount >= 1` 返回 true
- **E3**: 移动端响应式适配

**验证**:
- [ ] 未买升级品 → 卡片显示「推荐奖 🔒」
- [ ] 买过升级品 → 卡片显示「推荐奖 ✅」
- [ ] 业务规则 §5.2 line 400-426 举例全部通过

---

### Group F：推荐奖未解锁 Toast（半天）

**依据**: 业务规则 §5.3 + §7.2

**现状问题**: `reward.service.ts:62` 只有 `logger.info`，没前端 Toast

**任务**:
- **F1**: 后端 `RewardService.createReferralReward` 返回 `unlockRequired: true` 信号
- **F2**: 前端支付成功回调里检查 `unlockRequired`
  - 弹 Toast：「您还未购买升级品，本次推荐奖 ¥XX 未发放。购买升级品即可解锁。」
- **F3**: 移动端 Toast 适配

**验证**:
- [ ] A 没买升级品 + B 买 500 元 → Toast 弹出
- [ ] 业务规则 §5.3 line 432-433 文案一致

---

### Group G-I：详见项目清单

（业务 v2 细节优化 + 派单遗留，3 个任务，详见 `docs/项目清单.md`）

---

### Group J：角色权限白名单（半天）

**依据**: v47 系统优化任务 1.2（v47 已归档，但 v47 描述有效）

**现状问题**: 大量路由硬编码 `['admin', 'super_admin']`，但 `admin` 角色不存在

**任务**:
- **J1**: grep 所有 `verifyPermission.*\['admin'` 路由
- **J2**: 按业务分配正确权限：
  ```typescript
  // 订单管理 → super_admin, goods_admin
  // 退款管理 → super_admin, finance_admin
  // 用户管理 → super_admin, support_admin
  // 通知管理 → super_admin
  // 财务管理 → super_admin, finance_admin
  ```
- **J3**: 验证每个权限变更后，goods_admin/finance_admin/support_admin 能正常访问对应模块

**验证**:
- [ ] goods_admin 能访问订单管理
- [ ] finance_admin 能访问退款管理
- [ ] support_admin 能访问用户管理
- [ ] 现状调研 §7.2 bug 已修复

---

### Group K：支付密码强制生效（半天）

**依据**: v47 系统优化任务 1.1

**现状**: v43-7 Batch 2.1 (commit `bc3d02e`) 已切前端到 verify-payment，**但需验证是否所有入口都切了**

**任务**:
- **K1**: grep 所有 `/api/orders/.*/pay` 调用方
- **K2**: 确认所有前端入口都改调 `/api/orders/[id]/verify-payment`
- **K3**: 旧 pay 路由加 410 Gone 状态码（保留不删）

**验证**:
- [ ] `rg "api/orders/.*/pay" src/app/` 0 个业务调用
- [ ] 支付时必须输入 6 位数字密码
- [ ] 密码错误时支付失败

---

### Group L：自动确认收货 + 限流加固（1-2 天）

**依据**: v47 系统优化任务 1.3 + 1.5

**任务**:
- **L1**: 加 `vercel.json` 配置 cron 定时任务
  - 每日跑 `PointsService.dailyUnlock`
  - 每日跑 `DividendService.settleDailyDividends`
  - **新加**：每日跑 `OrderService.autoCompleteOrders`
- **L2**: API 限流加固
  - 登录/注册路由加 `rate-limit`
  - 支付路由加 `rate-limit`
  - 调账路由加 `rate-limit`
- **L3**: cron 任务幂等性验证

**验证**:
- [ ] Vercel Dashboard 显示 cron 任务已配置
- [ ] 自动确认收货：发货后 N 天自动完成
- [ ] 限流生效：同 IP 1 分钟内最多 5 次登录

---

### Group M：退款全流程通知 + 文案（1 天）

**依据**: v47 系统优化任务 2.1 + 2.5

**现状**: v46.12 已实现 review + complete 通知，缺申请提交通知

**任务**:
- **M1**: 申请退款时发通知给用户
  - 模板：「您的退款申请已提交，金额 ¥XX，等待审核」
- **M2**: 退款文案更新
  - `app/admin/refunds/page.tsx:532` 改文案
  - 业务规则已要求："确认后将执行退款，金额将退回用户余额"
- **M3**: admin 退款列表加「申请时间」字段（如缺）

**验证**:
- [ ] 申请退款 → 用户收到通知
- [ ] admin 端文案与业务规则一致
- [ ] 退款全流程 3 个节点都有通知（申请 + 审核 + 完成）

---

### Group N：OrderService 拆分（2-3 天）

**依据**: v47 系统优化任务 3.1

**任务**: `order.service.ts`（720+ 行）拆 5 个子 service
- **N1**: `order-lifecycle.service.ts` — 订单状态机（pending → paid → shipped → completed）
- **N2**: `order-payment.service.ts` — 支付 + 验证密码 + 退款
- **N3**: `order-fulfillment.service.ts` — 发货 + 收货 + 自动完成
- **N4**: `order-notification.service.ts` — 订单相关通知（复用 v46.4 sendInApp）
- **N5**: `order.service.ts` 变成 facade（外观模式，对外暴露原 API，内部委托）

**验证**:
- [ ] 拆完后 `order.service.ts` < 200 行
- [ ] 所有原 API 路径不变
- [ ] `pnpm build` 0 错误
- [ ] 单元测试覆盖每个子 service

---

### Group O：收益明细过滤 + setInterval 清理（1-2 天）

**依据**: v47 系统优化任务 2.7 + v49 工程版 A2

**任务**:
- **O1**: 收益明细过滤 refunded — `app/api/rewards/route.ts`
  - 加 `status: { not: 'refunded' }` 过滤
- **O2**: setInterval 内存泄漏扫描
  - grep 所有 `setInterval` + `useEffect`
  - v46.10 已修 Header.tsx 1 个，**还要扫剩余 20+ 文件**
- **O3**: admin 端对应同步

**验证**:
- [ ] 收益明细不显示 refunded 记录
- [ ] setInterval 全部有 clearInterval cleanup
- [ ] 业务规则 §7.1 不变（refund_dividend 走 voided）

---

### Group P：earnings_void 独立 type（2h）

**依据**: v2.4 派单存档遗留

**任务**:
- **P1**: `app/api/admin/users/[id]/balance/route.ts` 调账时支持 `earnings_void` type
  - 加 `earnings_void` 到 ALLOWED_TYPES
- **P2**: 流水页面「作废」tab 显示出来
  - `app/dashboard/balance/page.tsx` 加 `void` tab
- **P3**: admin 端对应同步

**验证**:
- [ ] admin 调账时能选 `earnings_void` type
- [ ] 用户端「作废」tab 显示 earnings_void 记录
- [ ] v2.4 派单存档 line 309 决策已实现

---

## 🚀 执行原则（强约束）

### 铁律 1：commit + push 成功 ≠ 部署完成
1. `git push origin main` 之后**必须**跑 `git log origin/main --oneline -1`
2. 对比 Vercel Dashboard 最新部署的 commit hash
3. **不一致 = push 失败**，需要重新 push

### 铁律 2：UI 改动必须本地 dev server 真实截图
1. 改完代码后**必须** `pnpm dev` 启 dev server
2. **必须**真实浏览器打开目标页面
3. **必须**登录后台 → 访问受保护页面 → 截图

### 铁律 3：业务决策以 v2 需求文档为准
- **唯一依据**: `docs/业务规则需求文档.md`（胡子哥 2026-06-23 凌晨 1:46 确认）
- 任何任务如果与 v2 决策冲突，**停下来找胡子哥确认**
- 不准用 v1 思路或直觉猜业务规则

### 铁律 4：派单前必做 4 步检查
1. grep 实际枚举值（v53d 教训）
2. grep fetch 鉴权 header + middleware 路径表（v46.6 教训）
3. read 一次相关工具函数（v8 教训——凭印象写错）
4. 检查是否与 v2 业务决策冲突

### 铁律 5：派单提示词格式（胡子哥规则）
- 派单提示词**必须**包在 4 反引号 ````markdown ... ```` 代码框里
- 一个连续的 markdown 块，开头 `# v50-xxx Group X / 步骤 X`，结尾 `## 完成后告诉胡子哥`
- 不要拆分 + 不要夹杂解释 + 不要 media tag

---

## 📝 工程师使用指南

### 如何选下一个 Group？

1. **看工期**：P0 业务核心先做（9 个 Group）
2. **看依赖**：Group A 最简单（清理），适合第一个试手
3. **看价值**：Group B（分红 5 级独立池）是核心，业务差距最大
4. **看心情**：P1 安全类（J/K/L/M）独立于业务核心，可穿插

### 一个 Group 的完整流程

```
1. 选 Group X
2. 读「Group X 详细说明」+ 项目清单的对应行
3. 派单给执行 AI（按铁律 5 格式）
4. 等执行 AI 反馈
5. 验证：
   - [ ] pnpm build 0 错误
   - [ ] 相关页面功能验证（铁律 2 截图）
   - [ ] 业务规则 v2 一致性检查
6. 验收后 → git commit + push + 验证 Vercel 部署（铁律 1）
7. 通知胡子哥
8. 下一个 Group
```

---

## 🔄 文档维护

- **每周**：胡子哥 review 当前进度，更新「已完成」标记
- **每完成一个 Group**：在项目清单里把状态从 ❌ 改成 ✅
- **任何 v2 决策变更**：胡子哥拍板 → 同步更新业务规则需求文档 + 本文档
- **v50 完成后**：归档至 `docs/归档/计划/`，启动 v51

---

**胡子哥批准后开始执行。先做 Group A（团队奖清理，4 小时热身）。**
