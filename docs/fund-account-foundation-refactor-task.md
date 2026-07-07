# 资金底座重构执行单

> 决策人：胡子老师  
> 方案与审核：小酷  
> 执行：猫爪  
> 日期：2026-07-07  
> 对应规格：`docs/fund-account-recharge-withdrawal-spec.md`

## 1. 本轮目标

本轮只做资金底座，不做完整充值页面、完整提现页面、支付余额不足浮窗。

目标是先把系统底层资金语义改对：

1. `balance`（余额）：只用于购物消费。
2. `earningsAvailable`（可提现收益）：只承载奖励收益和可提现收益。
3. 奖励不再自动进入 `balance`（余额）。
4. 提现不再从 `balance`（余额）发起。
5. 退款扣回奖励时，不能扣用户充值余额。
6. 后续充值、提现、收益转余额都基于这套规则继续开发。

## 2. 当前已确认的核心问题

### 2.1 奖励同时进余额和收益

当前以下位置会同时增加 `balance`（余额）和 `earningsAvailable`（可提现收益）：

1. `src/lib/services/reward.service.ts`
   - 推荐奖 `createReferralReward`
   - 品牌管理奖 `createBrandBonusReward`
   - 分红奖 `createDividendReward`
2. `src/lib/services/dividend.service.ts`
   - 每日分红结算
3. `src/app/api/admin/manual-reward/route.ts`
   - 手动奖励

这与新规则冲突：奖励只能进入收益板块，不能自动进入余额。

### 2.2 提现从余额扣款

当前 `src/lib/services/withdrawal.service.ts`：

1. 创建提现时检查 `user.balance`。
2. 提交提现后扣 `balance`，加 `frozenBalance`。
3. 审核通过时直接写 `paidAt`。

这与新规则冲突：提现应从收益板块发起，不允许从余额发起。

### 2.3 退款奖励扣回会扣余额

当前 `RewardService.processRefund`：

1. 检查奖励用户 `balance` 是否足够。
2. 从 `balance` 扣奖励。
3. 同时扣或作废收益字段。

这与新规则冲突：奖励扣回应优先扣收益，不足部分记作废或追扣记录，不能扣充值余额。

### 2.4 后台调账权限和资金类型混用

当前 `src/app/api/admin/users/[id]/balance/route.ts`：

1. `recharge`（充值）和 `earnings_add`（收益增加）都会影响 `balance`。
2. 权限包含 `support_admin`（客服/支持管理员），但充值和收益调整应归财务权限。

本轮至少要把资金类型语义和权限边界标清楚，避免后续充值闭环继续复用错误入口。

## 3. 本轮改动范围

### 3.1 奖励入账规则

把所有奖励入账从：

```ts
data: {
  balance: { increment: amount },
  earningsAvailable: { increment: amount },
}
```

改为：

```ts
data: {
  earningsAvailable: { increment: amount },
}
```

同时修正对应 `BalanceRecord`（余额/收益流水）：

1. `balance` 字段应保持原余额不变。
2. `amount` 仍记录本次收益金额。
3. `description` 必须体现“可提现收益 +X，余额不变”。
4. `sourceType` 和 `sourceId` 保持可追溯。

涉及文件：

1. `src/lib/services/reward.service.ts`
2. `src/lib/services/dividend.service.ts`
3. `src/app/api/admin/manual-reward/route.ts`

### 3.2 提现资金来源规则

提现创建时从 `earningsAvailable`（可提现收益）扣减。

当前 schema（数据库结构）没有 `earningsFrozen`（冻结收益）字段。

胡子老师已拍板：本轮采用新增 `earningsFrozen`（冻结收益）字段方案。

原因：上线后财务审计会更清楚，余额冻结和收益冻结不会混在一起；提现链路也不会再误用 `frozenBalance`（冻结余额）。

需要改动：

1. `prisma/schema.prisma` 增加 `earningsFrozen Float @default(0) @map("earnings_frozen")`。
2. 新增 Prisma migration（数据库迁移）。
3. `BALANCE_SELECT` 增加 `earningsFrozen`。
4. 提现申请：
   - 检查 `earningsAvailable >= amount`。
   - `earningsAvailable -= amount`。
   - `earningsFrozen += amount`。
5. 提现拒绝：
   - `earningsFrozen -= amount`。
   - `earningsAvailable += amount`。
6. 提现审核通过：
   - 只改状态为 `approved`（已审核通过）。
   - 不写 `paidAt`。
   - 不直接完成提现。

涉及文件：

1. `prisma/schema.prisma`
2. `src/lib/constants.ts`
3. `src/lib/services/withdrawal.service.ts`
4. `src/app/api/withdrawals/route.ts`
5. `src/app/api/admin/withdrawals/route.ts`
6. 相关前端展示字段先保持最小改动，只要不再显示“可提现余额=balance”。

### 3.3 退款奖励扣回规则

`RewardService.processRefund` 改为：

1. 对推荐奖、品牌管理奖：
   - 优先扣 `earningsAvailable`。
   - 如果 `earningsAvailable >= reward.amount`，直接扣可提现收益。
   - 如果不足：
     - 扣掉现有 `earningsAvailable`。
     - 不足部分增加 `earningsVoided`。
     - 不扣 `balance`。
     - 不让任何字段变负数。
2. 对分红：
   - 同样不能扣 `balance`。
   - 可提现收益足够则扣收益。
   - 不足部分写入 `earningsVoided`。
3. 保留 `Reward.status='refunded'`。
4. 分红是否删除原 `Dividend` 记录要谨慎：建议不要删除，改为增加可审计状态字段是更长期方案；如果本轮不改 schema，则至少不要破坏现有查询。

涉及文件：

1. `src/lib/services/reward.service.ts`
2. `src/lib/services/order-lifecycle.service.ts`
3. 相关测试文件。

### 3.4 后台调账的最小修正

本轮不做完整充值申请，只修正明显危险点：

1. `earnings_add`（收益增加）不能再同步增加 `balance`。
2. `earnings_void`（收益作废）不能同步影响 `balance`。
3. `recharge`（充值）仍然只进入 `balance`，但后续要被标准充值申请替代。
4. `recharge` 和收益类调账权限必须限制为 `super_admin`（超级管理员）和 `finance_admin`（财务管理员）。
5. 如果仍保留普通 `balance` 调账，需要单独确认 `support_admin`（客服/支持管理员）是否能用；默认不建议客服能改钱。

涉及文件：

1. `src/app/api/admin/users/[id]/balance/route.ts`
2. `src/lib/services/order-notification.service.ts`

## 4. 不在本轮做的内容

以下内容不要混进本轮：

1. 用户充值申请页面。
2. 后台充值审核 tab（标签页）。
3. 后台充值设置。
4. 收益转余额 API（接口）和浮窗。
5. 提现打款凭证上传。
6. 用户默认收款信息管理。
7. 完整财务页重构。

这些进入后续 P0 第二包、第三包、第四包。

## 5. 必须补的测试

至少补以下测试：

1. 推荐奖入账：只增加 `earningsAvailable`，不增加 `balance`。
2. 品牌管理奖入账：只增加 `earningsAvailable`，不增加 `balance`。
3. 手动奖励：只增加 `earningsAvailable`，不增加 `balance`。
4. 提现申请：扣 `earningsAvailable`，加 `earningsFrozen`。
5. 提现拒绝：退回 `earningsAvailable`，扣 `earningsFrozen`。
6. 提现审核通过：不写 `paidAt`，不扣 `balance`。
7. 退款扣回奖励：收益足够时扣收益，不扣余额。
8. 退款扣回奖励：收益不足时写 `earningsVoided`，不扣余额，不出现负数。
9. 后台 `earnings_add`：只加收益，不加余额。
10. 后台 `recharge`：只加余额，不加收益。

## 6. 验证命令

猫爪完成后必须运行：

```bash
npx prisma generate
npx tsc --noEmit -p tsconfig.typecheck.json
npx vitest run
npx next build
```

如果涉及 `lint`（代码规范检查）改动，也要运行：

```bash
npx next lint
```

## 7. 本地业务验证

猫爪必须用测试账号跑以下链路，不能只看 build（构建）：

1. 后台给用户发手动奖励 100。
   - 用户 `earningsAvailable` 增加 100。
   - 用户 `balance` 不增加。
2. 用户申请提现 50。
   - `earningsAvailable` 减少 50。
   - `earningsFrozen` 增加 50。
   - 提现状态为 `pending`（待审核）。
3. 后台拒绝提现。
   - `earningsAvailable` 回加 50。
   - `earningsFrozen` 减少 50。
4. 用户购买商品。
   - 只能扣 `balance` 和积分。
   - 不直接扣 `earningsAvailable`。
5. 退款完成。
   - 订单支付金额退回 `balance`。
   - 积分退回。
   - 已发奖励从收益扣回或作废，不扣充值余额。

## 8. 交付要求

猫爪交付时必须提供：

1. 改动文件清单。
2. 数据库 migration（迁移）文件名。
3. 每条测试命令结果。
4. 至少 5 个关键业务场景验证截图或日志。
5. commit hash（提交哈希）。
6. 如果 push（推送）到 main，必须跑：

```bash
git log origin/main --oneline -1
```

并确认远程 commit hash（提交哈希）和本地一致。

## 9. 小酷审核重点

小酷审核时重点看：

1. 是否还有奖励代码写 `balance: { increment: amount }`。
2. 是否还有提现代码检查或扣减 `user.balance`。
3. 是否还有退款奖励扣回代码检查或扣减 `user.balance`。
4. 是否所有资金变动都在 transaction（事务）里。
5. 是否所有流水都有 sourceType（来源类型）、sourceId（来源 ID）和清晰 description（说明）。
6. 是否所有 admin（后台管理）资金接口权限都符合财务边界。
7. 是否测试覆盖了收益不足、余额不足、重复审核等边界。

## 10. 暂定验收标准

本轮完成后，系统应满足：

1. 奖励只进收益。
2. 余额只用于购物。
3. 提现只从收益发起。
4. 退款不扣充值余额。
5. 后台财务调账不会把收益和余额混加。
6. 充值闭环、提现凭证、收益转余额可以在这个基础上继续开发。
