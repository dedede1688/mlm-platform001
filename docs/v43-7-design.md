# v43-7 设计文档：BalanceRecord 全流水对齐

> 生成时间：2026-06-20
> 设计者：小京（chat-only，资料由胡子哥分 5 段提供）
> 目标：让所有余额变更入口都写 BalanceRecord 流水

---

## 章节 1：现状盘点

### v43-6 已有的 BalanceRecord 写入点

| # | 方法 | service 文件 | type 值 | 触发场景 |
|---|------|-------------|---------|---------|
| 1 | `OrderService.payOrder` | order.service.ts | `payment` | 用户支付订单，扣减可用余额 |
| 2 | `OrderService.requestRefund` | order.service.ts | `refund` | 订单退款，退回可用余额 |

**写入风格（v43-6 已有）**：
- 写在事务内部（`prisma.$transaction` 的 `tx` 上）
- 先查用户当前 balance/frozenBalance，再变更，再用变动后的值写入 BalanceRecord
- `amount` 正负含义：payment 为负数（扣减），refund 为正数（退回）
- `sourceType`：`'order'`，`sourceId`：orderId
- `description`：中文说明，含订单号

### v43-7 需要补齐的写入点

| # | 余额变更场景 | 当前代码位置 | 缺失的 BalanceRecord type |
|---|-------------|-------------|-------------------------|
| 1 | 提现申请（冻结） | `WithdrawalService.createWithdrawal` | `withdraw_freeze` |
| 2 | 提现拒绝（解冻退回） | `WithdrawalService.reviewWithdrawal(approved=false)` | `unfreeze` |
| 3 | 提现通过（扣除冻结余额） | `WithdrawalService.reviewWithdrawal(approved=true)` | `withdraw` |
| 4 | 管理员调账 | `POST /api/admin/users/[id]/balance` | `admin_adjust` |
| 5 | 手动奖励发放 | `POST /api/admin/manual-reward` | `manual_reward` |
| 6 | 奖励发放（直推/团队/品牌/分红） | `RewardService` 各方法 | `reward` |

**注意**：`reward` type 在 schema 注释中已定义但 RewardService 的 4 个奖励方法（`createReferralReward`/`createTeamRewards`/`createBrandBonusReward`/`createDividendReward`）当前**都没有写 BalanceRecord**，这也是 v43-7 需要补齐的。

**我对本章节的理解：7/10，疑问点**：
1. `unfreeze` 这个 type 在 schema 注释里已经存在，但 v43-6 没有任何地方写过。v43-7 是否需要新增 `withdraw_freeze` 和 `manual_reward` 两个 type？还是用已有的 `withdraw` + `unfreeze` 覆盖？
2. 奖励发放（RewardService）是否也属于 v43-7 范围？任务描述说"4类余额变动没覆盖"，但奖励发放是第 5 类。

---

## 章节 2：type 枚举设计

### 已有 type（schema 注释定义）

| type | 含义 | amount 正负 | balance 变 | frozenBalance 变 |
|------|------|------------|-----------|----------------|
| `payment` | 订单支付扣减 | 负（-payAmount） | 减少 | 不变 |
| `refund` | 订单退款退回 | 正（+payAmount） | 增加 | 不变 |
| `reward` | 奖励发放到账 | 正（+rewardAmount） | 增加 | 不变 |
| `withdraw` | 提现扣减 | 负（-amount） | 不变 | 减少 |
| `unfreeze` | 解冻退回可用余额 | 正（+amount） | 增加 | 减少 |
| `admin_adjust` | 管理员手动调账 | 正/负（看方向） | 增加/减少 | 增加/减少 |

### 新增 type 建议

| 新 type | 原因 | amount 正负 | balance 变 | frozenBalance 变 |
|---------|------|------------|-----------|----------------|
| `withdraw_freeze` | 提现申请时冻结余额，这是与 `withdraw` 不同的阶段 | 负（-amount 从 balance）+ 正（+amount 到 frozenBalance） | 减少 | 增加 |

**设计理由**：

1. **为什么不把冻结和扣减合并为 `withdraw`**：提现有 3 个阶段（冻结→通过扣减 / 拒绝退回），每个阶段的 balance/frozenBalance 变动方向不同。如果只用一个 `withdraw` type，无法区分"申请冻结"和"审核通过扣减"。分两个 type 让流水可追溯每个阶段。

2. **`manual_reward` 是否需要新增**：不需要。手动奖励本质上是管理员操作，可以用 `admin_adjust` type + `sourceType='manual_reward'` 来区分。理由：type 字段描述的是"余额变动类型"而非"触发来源"，手动奖励导致余额增加 = 调账行为，`sourceType` 区分来源即可。

3. **奖励发放 `reward` 已在 schema 注释中定义**，直接使用即可，无需新增。

4. **命名规范**：全部 snake_case，与已有 type 保持一致。

### 最终 type 枚举（v43-7）

| type | 触发场景 | amount | balance | frozenBalance |
|------|---------|--------|---------|---------------|
| `payment` | 支付订单 | 负 | 减 | 不变 |
| `refund` | 退款退回 | 正 | 加 | 不变 |
| `reward` | 奖励发放 | 正 | 加 | 不变 |
| `withdraw_freeze` | 提现申请冻结 | 负（从 balance） | 减 | 加 |
| `withdraw` | 提现通过扣减冻结 | 负 | 不变 | 减 |
| `unfreeze` | 提现拒绝/解冻退回 | 正 | 加 | 减 |
| `admin_adjust` | 管理员调余额/冻结余额 | 正/负 | 加/减 | 加/减 |
| `manual_reward` | 管理员手动发放奖励 | 正 | 加 | 不变 |
| `reward_refund` | 退款时扣回已发放的奖励 | 负（-rewardAmount） | 减 | 不变 |

**等等**——我在上面说了 `manual_reward` 不需要新增，可以用 `admin_adjust` + `sourceType`。但再想一下：**手动奖励和管理员调账的业务含义完全不同**。手动奖励是"发放"，是正向收入；调账是"纠正"，可能是加也可能是减。流水查询时"查看我的奖励收入"和"查看管理员对我的调账"是两个不同的筛选维度。如果混在一起，前端筛选会很麻烦。

**修正**：新增 `manual_reward` type。理由：业务语义不同、筛选需求不同、审计追溯需要区分"奖励发放"和"强制调账"。

**拍板结果**：
1. `withdraw_freeze` → **一条记录**，amount 记负数（balance 净变动），frozenBalance 字段记变动后值。理由：流水记录的 amount 代表"可用余额变动方向"，frozenBalance 字段是快照，两个维度一条记录即可追溯完整信息。
2. `manual_reward` → 新增独立 type，与 `admin_adjust` 区分。理由：业务语义不同、筛选需求不同、审计追溯需要区分"奖励发放"和"强制调账"。
3. `reward_refund` → 新增独立 type，与 `refund` 区分。理由：订单退款（refund）和奖励扣回（reward_refund）的业务来源不同，前端筛选"退款记录"不应混入奖励扣回记录。

**我对本章节的理解：9/10，疑问点**：
1. schema 的 BalanceRecord.type 是 `String` 不是枚举，新增 type 不需要改 schema，只需要在注释里补充。是否应该在 schema 中改为枚举约束？

---

## 章节 3：各写入点详细设计

### 写入点 1：提现申请冻结（withdraw_freeze）

| 字段 | 内容 |
|------|------|
| **触发位置** | `WithdrawalService.createWithdrawal` 事务内 |
| **入参** | userId: string, amount: number |
| **出参** | withdrawal 对象（含 id） |
| **BalanceRecord.type** | `withdraw_freeze` |
| **BalanceRecord.amount** | 负（-amount），代表从可用余额扣减 |
| **BalanceRecord.balance** | 原余额 - amount（事务内查到的 freshUser.balance - amount） |
| **BalanceRecord.frozenBalance** | 原冻结 + amount（事务内查到的 freshUser.frozenBalance + amount） |
| **BalanceRecord.sourceType** | `withdrawal` |
| **BalanceRecord.sourceId** | withdrawal.id |
| **BalanceRecord.description** | `提现申请冻结 ¥${amount}` |
| **事务边界** | 与 `user.updateMany`（扣 balance + 加 frozenBalance）+ `withdrawal.create` 同事务 |

**关键点**：当前 `createWithdrawal` 用 `updateMany` 做原子扣减，事务内没有查 freshUser。需要先查用户拿 balance/frozenBalance 当前值，再 updateMany，再写 BalanceRecord。

---

### 写入点 2：提现拒绝/解冻退回（unfreeze）

| 字段 | 内容 |
|------|------|
| **触发位置** | `WithdrawalService.reviewWithdrawal` 事务内（approved=false 分支） |
| **入参** | withdrawalId: string, approved: boolean, rejectReason?: string |
| **出参** | 更新后的 withdrawal 对象 |
| **BalanceRecord.type** | `unfreeze` |
| **BalanceRecord.amount** | 正（+withdrawal.amount），代表退回可用余额 |
| **BalanceRecord.balance** | 原余额 + withdrawal.amount |
| **BalanceRecord.frozenBalance** | 原冻结 - withdrawal.amount |
| **BalanceRecord.sourceType** | `withdrawal` |
| **BalanceRecord.sourceId** | withdrawal.id |
| **BalanceRecord.description** | `提现拒绝，解冻退回 ¥${withdrawal.amount}` |
| **事务边界** | 与 `user.update`（加 balance + 减 frozenBalance）+ `withdrawal.update` 同事务 |

**关键点**：当前代码在 approved=false 时做了 `balance: increment` + `frozenBalance: decrement`，但没有查当前值。需要在事务内先查 freshUser。

---

### 写入点 3：提现通过扣减冻结（withdraw）

| 字段 | 内容 |
|------|------|
| **触发位置** | `WithdrawalService.reviewWithdrawal` 事务内（approved=true 分支） |
| **入参** | withdrawalId: string, approved: boolean |
| **出参** | 更新后的 withdrawal 对象 |
| **BalanceRecord.type** | `withdraw` |
| **BalanceRecord.amount** | 负（-withdrawal.amount），代表冻结余额扣减 |
| **BalanceRecord.balance** | 不变（原余额值） |
| **BalanceRecord.frozenBalance** | 原冻结 - withdrawal.amount |
| **BalanceRecord.sourceType** | `withdrawal` |
| **BalanceId.sourceId** | withdrawal.id |
| **BalanceRecord.description** | `提现通过，扣减冻结 ¥${withdrawal.amount}` |
| **事务边界** | 与 `user.update`（减 frozenBalance）+ `withdrawal.update` 同事务 |

**关键点**：approved=true 时 balance 不变，只有 frozenBalance 减少。需要在事务内先查 freshUser 拿 balance/frozenBalance。

---

### 写入点 4：管理员调账（admin_adjust）

| 字段 | 内容 |
|------|------|
| **触发位置** | `POST /api/admin/users/[id]/balance` 事务内 |
| **入参** | id(userId): string, type: 'balance'|'frozenBalance', amount: number, reason: string |
| **出参** | `{ success: true, data: { [field]: newValue } }` |
| **BalanceRecord.type** | `admin_adjust` |
| **BalanceRecord.amount** | 正/负（直接用传入的 amount 值，正=加，负=减） |
| **BalanceRecord.balance** | 变动后的 balance 值（事务内 updatedUser.balance） |
| **BalanceRecord.frozenBalance** | 变动后的 frozenBalance 值（事务内 updatedUser.frozenBalance） |
| **BalanceRecord.sourceType** | `admin` |
| **BalanceRecord.sourceId** | 操作日志的 id（或 admin.id）——建议用 OperationLog 的 id |
| **BalanceRecord.description** | `管理员调账：${fieldLabel}${actionLabel} ¥${Math.abs(amount)}，原因：${reason}` |
| **事务边界** | 与 `user.update` 同事务；OperationLog 在事务外写，所以 sourceId 可用 admin.id 作为兜底 |

**关键点**：当前代码事务内已经查了 user 并做了 update，返回了 updated 对象。直接用 `updated.balance` 和 `updated.frozenBalance` 作为记录值即可，不需要额外查。

**sourceId 方案**：OperationLog 在事务外写（当前代码就是事务外 `logOperation`），无法在事务内拿到 OperationLog 的 id。两个选择：
1. 用 admin.id 作为 sourceId——简单但不够精确
2. 把 logOperation 也移到事务内——需要改 logOperation 的实现

**建议**：先用 admin.id 作为 sourceId，后续版本再优化。理由：admin_adjust 流水最关键的是 amount/balance/frozenBalance/description，sourceId 指向管理员 ID 已经足够追溯。

---

### 写入点 5：手动奖励发放（manual_reward）

| 字段 | 内容 |
|------|------|
| **触发位置** | `POST /api/admin/manual-reward` 事务内 |
| **入参** | userId: string, amount: number, type?: string, reason: string |
| **出参** | `{ user, reward }` |
| **BalanceRecord.type** | `manual_reward` |
| **BalanceRecord.amount** | 正（+amount），代表奖励入账 |
| **BalanceRecord.balance** | 原余额 + amount（事务内 updatedUser.balance） |
| **BalanceRecord.frozenBalance** | 不变（事务内 updatedUser.frozenBalance） |
| **BalanceRecord.sourceType** | `manual_reward` |
| **BalanceRecord.sourceId** | manualReward.id（事务内创建的） |
| **BalanceRecord.description** | `手动奖励 ¥${amount}，原因：${reason}` |
| **事务边界** | 与 `user.update`（加 balance）+ `manualReward.create` 同事务 |

**关键点**：当前代码事务内已经做了 `user.update` 和 `manualReward.create`，返回了两个对象。BalanceRecord 写入应该在 `manualReward.create` 之后，用 `result.reward.id` 作为 sourceId。

---

### 写入点 6：奖励发放（reward）

| 字段 | 内容 |
|------|------|
| **触发位置** | RewardService 的 4 个方法：createReferralReward / createBrandBonusReward / createTeamRewards / createDividendReward |
| **入参** | 各方法不同，核心：orderId + referrerId/buyerId + amount |
| **出参** | void（各方法无返回值） |
| **BalanceRecord.type** | `reward` |
| **BalanceRecord.amount** | 正（+rewardAmount），代表奖励入账 |
| **BalanceRecord.balance** | 原余额 + rewardAmount |
| **BalanceRecord.frozenBalance** | 不变 |
| **BalanceRecord.sourceType** | `reward` |
| **BalanceRecord.sourceId** | reward.id 或 dividend.id（事务内创建的） |
| **BalanceRecord.description** | `直推奖 ¥${amount}` / `团队奖 ¥${amount}` / `品牌管理奖 ¥${amount}` / `分红 ¥${amount}` |
| **事务边界** | 与 `reward.create`/`dividend.create` + `user.update` 同事务 |

**关键点**：当前每个奖励方法内都用了独立事务（`prisma.$transaction`），事务内做了 `reward.create` + `user.update`。需要在 `user.update` 之后、事务结束之前，写 BalanceRecord。需要在事务内先查 freshUser 拿 balance/frozenBalance 当前值。

### 写入点 7：退款扣回奖励（reward_refund）

| 字段 | 内容 |
|------|------|
| **触发位置** | `RewardService.processRefund` 事务内 |
| **入参** | orderId: string |
| **出参** | void |
| **BalanceRecord.type** | `reward_refund` |
| **BalanceRecord.amount** | 负（-reward.amount），代表扣回已发放的奖励 |
| **BalanceRecord.balance** | 原余额 - reward.amount |
| **BalanceRecord.frozenBalance** | 不变 |
| **BalanceRecord.sourceType** | `reward` |
| **BalanceRecord.sourceId** | reward.id（被扣回的那条 reward 记录的 id） |
| **BalanceRecord.description** | `扣回奖励 ¥${reward.amount}（${reward.type}）` |
| **事务边界** | 与 `user.update`（减 balance）+ `reward.update`（改 status=refunded）同事务 |

**关键点**：当前 `processRefund` 事务内逐条扣回 reward 和 dividend。需要在每条扣回后写一条 BalanceRecord。dividend 扣回的处理：dividend 没有 id 可追溯（当前是 delete），建议 dividend 扣回也用 `reward_refund` type，sourceType='dividend'，sourceId=dividend.id。

---

**我对本章节的理解：8/10，疑问点**：
1. `withdraw_freeze` 的 amount 记为负数，但 frozenBalance 同时增加了——一条记录即可追溯完整信息（amount=balance净变动，frozenBalance字段是快照）。
2. admin_adjust 的 sourceId 用 admin.id 是否够用？如果未来需要"查看某次调账操作的详细信息"，admin.id 只能指向操作人而非操作记录。

---

## 章节 4：API 路由影响

### 需修改的 API 路由

| # | 路径 | 方法 | 修改内容 | 入参 | 出参 | 错误码 |
|---|------|------|---------|------|------|--------|
| 1 | `/api/admin/users/[id]/balance` | POST | 事务内新增 BalanceRecord 写入 | 不变（type/amount/reason） | 不变 | 不变 |
| 2 | `/api/admin/manual-reward` | POST | 事务内新增 BalanceRecord 写入 | 不变（userId/amount/type/reason） | 不变 | 不变 |
| 3 | `/api/withdrawals` | POST | 调用 WithdrawalService.createWithdrawal 已含写入 | 不变 | 不变 | 不变 |
| 4 | `/api/admin/withdrawals` | POST（审核） | 调用 WithdrawalService.reviewWithdrawal 已含写入 | 不变 | 不变 | 不变 |

### 需修改的 service 文件

| # | 文件 | 修改内容 |
|---|------|---------|
| 1 | `withdrawal.service.ts` | `createWithdrawal`：事务内查 freshUser + 写 BalanceRecord；`reviewWithdrawal`：两个分支各写一条 BalanceRecord |
| 2 | `reward.service.ts` | `createReferralReward`/`createBrandBonusReward`/`createTeamRewards`/`createDividendReward`：每个方法事务内写 BalanceRecord；`processRefund`：扣回奖励/分红时写 BalanceRecord（type=reward_refund） |
| 3 | `admin/users/[id]/balance/route.ts` | 事务内写 BalanceRecord |
| 4 | `admin/manual-reward/route.ts` | 事务内写 BalanceRecord |

### 不需要新增 API 路由

所有写入点都在现有 service/API 的事务内完成，不需要新增路由。前端不需要改动——BalanceRecord 是内部审计记录，前端只在"余额明细"页面查询展示。

### 查询 API 影响

当前用户余额明细查询可能用 `/api/users/me` 或 `/api/rewards`，v43-7 之后需要一个**统一的余额流水查询接口**：

| 建议 | 路径 | 方法 | 入参 | 出参 |
|------|------|------|------|------|
| 新增 | `/api/user/balance-records` | GET | userId（从 token）、type?（筛选）、page/limit | `{ records: BalanceRecord[], pagination }` |

理由：v43-6 已有 payment/refund 两种记录，v43-7 补齐后 type 有 8 种，用户需要看到完整的余额变动历史，而非只看奖励列表。

**我对本章节的理解：8/10，疑问点**：
1. `/api/user/balance-records` 是否属于 v43-7 范围？还是单独一个版本？
2. processRefund 扣回奖励时写 BalanceRecord，type 用 `reward_refund`（已拍板）。理由：与订单退款 `refund` type 区分，前端筛选时不会混入。

---

## 章节 5：测试场景

### 写入点 1：withdraw_freeze

**Happy path**：
- 用户余额 100，申请提现 30
- 期望：balance 变 70，frozenBalance 变 30，BalanceRecord：type=withdraw_freeze, amount=-30, balance=70, frozenBalance=30, sourceType=withdrawal

**异常 path**：
- 用户余额 10，申请提现 50
- 期望：抛出"余额不足"，无 BalanceRecord 写入，无 withdrawal 创建

### 写入点 2：unfreeze（提现拒绝）

**Happy path**：
- 提现记录 pending，金额 30，审核拒绝
- 期望：balance 从 70 回到 100，frozenBalance 从 30 回到 0，BalanceRecord：type=unfreeze, amount=30, balance=100, frozenBalance=0

**异常 path**：
- 提现记录已 approved，尝试再次拒绝
- 期望：抛出"提现记录已处理"，无 BalanceRecord 写入

### 写入点 3：withdraw（提现通过）

**Happy path**：
- 提现记录 pending，金额 30，审核通过
- 期望：frozenBalance 从 30 变 0，balance 不变（70），BalanceRecord：type=withdraw, amount=-30, balance=70, frozenBalance=0

**异常 path**：
- 提现记录不存在，尝试审核
- 期望：抛出"提现记录不存在"，无 BalanceRecord 写入

### 写入点 4：admin_adjust

**Happy path**：
- 管理员给用户余额加 50，reason="补偿"
- 期望：balance 增加 50，BalanceRecord：type=admin_adjust, amount=50, balance=原+50, frozenBalance=不变, sourceType=admin

**异常 path**：
- 管理员给用户余额减 200，但用户只有 100
- 期望：抛出"余额不足"，无 BalanceRecord 写入

### 写入点 5：manual_reward

**Happy path**：
- 管理员给用户发放 100 奖励，reason="活动奖励"
- 期望：balance 增加 100，BalanceRecord：type=manual_reward, amount=100, balance=原+100, frozenBalance=不变, sourceType=manual_reward

**异常 path**：
- userId 对应的用户不存在或已 deleted
- 期望：返回 404，无 BalanceRecord 写入

### 写入点 6：reward（奖励发放）

**Happy path**：
- 直推奖 10% × 100 = 10，推荐人余额增加 10
- 期望：BalanceRecord：type=reward, amount=10, balance=原+10, frozenBalance=不变, sourceType=reward, sourceId=reward.id

**异常 path**：
- 订单状态不是 paid（processOrderRewards 入口校验）
- 期望：方法直接 return，无 BalanceRecord 写入

### 写入点 7：reward_refund（退款扣回奖励）

**Happy path**：
- 退款时扣回直推奖 10 元，推荐人余额减少 10
- 期望：BalanceRecord：type=reward_refund, amount=-10, balance=原-10, frozenBalance=不变, sourceType=reward, sourceId=reward.id

**异常 path**：
- 退款时用户余额不足扣回奖励（余额只有 5，需扣 10）
- 期望：当前代码直接 decrement 不做余额校验——**风险点**，可能导致余额变负数

**我对本章节的理解：8/10，疑问点已解决**：
1. ✅ processRefund 扣回奖励的 BalanceRecord type → 拍板新增 `reward_refund` 独立 type，已在写入点7中列出完整测试场景。
2. ✅ 奖励发放 BalanceRecord 在事务内写入——与 reward.create/user.update 同事务，事务回滚机制保证一致性。

---

## 章节 6：风险点

### 1. 数据一致性（BalanceRecord 与 User.balance/frozenBalance 同步）

**风险**：BalanceRecord.balance 和 BalanceRecord.frozenBalance 是"变动后快照"，必须与 User 表上的实际值一致。

**防护措施**：
- 所有 BalanceRecord 写入都在 `prisma.$transaction` 内，与 User.update 同事务
- 写入顺序：先 `user.update`/`user.updateMany`，再查 `freshUser`（事务内查到的就是已变更的值），最后写 `BalanceRecord`
- **绝不在事务外写 BalanceRecord**

**v43-6 已验证的模式**（payOrder）：
```typescript
const freshUser = await tx.user.findUnique({ where: { id }, select: { balance: true, frozenBalance: true } })
// 此时 freshUser.balance 已是扣减后的值
const nb = freshUser.balance  // 用作 BalanceRecord.balance
await tx.balanceRecord.create({ data: { ... balance: nb, ... } })
```

**但注意**：v43-6 的 payOrder 用了一个手动计算 `nb = freshUser.balance - order.payAmount`，而不是用 freshUser.balance 直接。这是因为 `updateMany` 后 `findUnique` 返回的可能还是旧值（Prisma 事务内查询缓存问题）。**更安全的做法是**：
1. 先 `findUnique` 查旧值
2. 再 `updateMany`/`update` 变更
3. 用旧值 + amount 计算新值写入 BalanceRecord

### 2. 重复写入防护

**风险**：如果一个流程被重试（如网络超时后前端重发请求），可能写入两条 BalanceRecord。

**防护措施**：
- **提现**：`createWithdrawal` 事务内 `updateMany` 带 `where: { balance: { gte: amount } }`，余额不够就 count=0 抛错，天然防重
- **提现审核**：`reviewWithdrawal` 检查 `status !== PENDING` 就抛错，天然防重
- **管理员调账**：无幂等保护——如果管理员重复点击，会写多条 BalanceRecord。建议前端加 loading 状态防重复提交，或 API 层加 request dedup
- **手动奖励**：每次 create 是新记录，无幂等问题（但可能被重复点击创建多条）。同上，前端防重
- **奖励发放**：`processOrderRewards` 检查 `order.status !== 'paid'` 就 return，天然防重（paid 状态只处理一次）

### 3. 并发场景

**风险**：两个管理员同时对同一用户调账，或用户同时申请提现和支付订单。

**防护措施**：
- Prisma `updateMany` 带 where 条件（如 `balance: { gte: amount }`）天然防并发透支
- 事务内查询+变更的隔离级别由 PostgreSQL 默认 READ COMMITTED 保证
- **最危险的场景**：管理员调账（`POST /admin/users/[id]/balance`）——当前事务内 `findUnique` + `update`，没有用 `updateMany` + where 条件做原子校验。如果同时有两个管理员对同一用户调账（一个加 100，一个减 50），事务不会冲突但最终值取决于执行顺序。**建议改为 `updateMany` + where 条件**，类似 payOrder 的模式。

### 4. 历史数据迁移（v43-6 之前的余额变动没流水）

**风险**：v43-6 之前产生的余额变动（奖励发放、提现审核等）没有 BalanceRecord 记录，用户查看余额明细时会有"断层"。

**处理方案**：
- **方案 A**：不回填——接受历史流水断层，BalanceRecord 只记录 v43-7 之后的变动。前端在余额明细页标注"更早记录请查看奖励/提现列表"
- **方案 B**：一次性回填脚本——遍历 Reward/Dividend/Withdrawal/ManualReward 表，按 createdAt 顺序为每条记录生成 BalanceRecord。需要计算每个时间点的 balance/frozenBalance 快照，复杂度高
- **方案 C**：部分回填——只回填最近 N 天的数据

**建议**：方案 A。理由：回填需要精确计算每个历史时间点的余额快照，中间有任何遗漏就会导致快照值与实际不一致。不如接受断层，让新数据从 v43-7 开始完整记录。

### 5. 扣回奖励余额不足（processRefund 余额变负）

**风险**：`processRefund` 事务内用 `decrement` 扣回奖励金额，不做余额校验。如果推荐人余额只有 5 但需扣回 10 的奖励，余额会变成 -5。

**防护措施**：
- **优先级 P2**——v43-7 先上线全流水对齐，余额变负风险单独在后续版本补校验逻辑（如 `where: { balance: { gte: rewardAmount } }` 原子校验）
- 短期依赖业务流程控制：退款只发生在有足够余额的场景（如大额用户）

**我对本章节的理解：8/10，疑问点已解决**：
1. ✅ Prisma 事务内查询缓存 → 拍板决定 v43-7 统一"先查旧值 + 手动计算新值"模式
2. ✅ 管理员调账并发 → 识别为风险点，建议后续优化为 `updateMany` + where 条件
3. ✅ 奖励扣回 BalanceRecord type → 拍板新增 `reward_refund` 独立 type

---

## 章节 7：实施顺序

### 推荐顺序

| 批次 | 写入点 | 理由 | 预估工作量 |
|------|--------|------|-----------|
| **Batch 1** | 提现相关（withdraw_freeze + unfreeze + withdraw） | 3 个 type 在同一个 service 文件（withdrawal.service.ts），改动集中，且提现是资金安全敏感区域，优先对齐 | 2-3h |
| **Batch 2** | 管理员调账（admin_adjust） | 单个 route 文件改动，逻辑简单（事务内已有 user.update 返回值） | 1h |
| **Batch 3** | 手动奖励（manual_reward） | 单个 route 文件改动，逻辑简单 | 1h |
| **Batch 4** | 奖励发放+扣回（reward + reward_refund） | 涉及 reward.service.ts 4 个奖励方法 + processRefund 扣回，改动点多，需要每个方法都加 BalanceRecord（含 reward_refund type） | 2-3h |
| **Batch 5** | 余额流水查询 API（`/api/user/balance-records`） | 前端展示需要，但不影响写入逻辑 | 1h |

### 总工作量预估：7-9h

### 实施原则

1. **每个 Batch 独立 commit + push + 验证部署**（遵循铁律 1）
2. **每个 Batch 完成后跑 build 0 错误**（遵循铁律 4）
3. **提现相关（Batch 1）必须走完整链路测试**（遵循铁律 6）——申请→审核通过→检查流水 / 申请→审核拒绝→检查流水
4. **奖励发放+扣回（Batch 4）走完整链路**——下单→支付→奖励发放→检查各推荐人的 BalanceRecord；退款→扣回奖励→检查 reward_refund 流水

### 建议的 commit 格式

```
feat(withdrawal): 提现全流程 BalanceRecord 流水（v43-7 Batch 1）
feat(admin): 管理员调账 BalanceRecord 流水（v43-7 Batch 2）
feat(admin): 手动奖励 BalanceRecord 流水（v43-7 Batch 3）
feat(reward): 奖励发放+扣回 BalanceRecord 流水（v43-7 Batch 4）
feat(user): 余额流水查询 API（v43-7 Batch 5）
```

---

## 全局自评

**我对 v43-7 全局理解：9/10**（修订后）

**原疑问已全部由胡子哥拍板解决**：

1. ✅ **withdraw_freeze 的 amount 语义** → 拍板：一条记录，amount 记负数（balance 净变动），frozenBalance 字段记变动后快照值。理由：一条记录即可追溯完整的双维度变动信息。

2. ✅ **processRefund 扣回奖励的 BalanceRecord type** → 拍板：新增 `reward_refund` 独立 type，与订单退款 `refund` 区分。理由：业务来源不同，前端筛选不应混入。

3. ✅ **Prisma 事务内 findUnique 的返回值可靠性** → 拍板：v43-7 统一"先查旧值 → 变更 → 用旧值+变动量计算新值"模式，不依赖 findUnique 返回值。理由：避免 Prisma 事务内查询缓存不确定性。

**剩余风险**：
- 管理员调账并发 → 后续优化为 `updateMany` + where 条件
- processRefund 余额变负 → P2 单独补校验逻辑
- 历史数据断层 → 方案A 不回填，接受断层

---

## 章节 8：Batch 2.2 — 4 字段业务接入设计（胡子哥临时加的新方向）

> **背景**：2026-06-23 v43-7 Batch 2.2.a（commit 788de58）加了 4 个账户字段：
> - `consumeBalance` (consume_balance) — 消费余额
> - `earningsPending` (earnings_pending) — 待结算收益
> - `earningsAvailable` (earnings_available) — 可提现收益
> - `earningsVoided` (earnings_voided) — 累计作废
>
> **问题**：schema 加了但**业务代码 0 处引用**——4 个字段是"死账户"。v43-7-design.md 原计划里也没有 Batch 2.2 范围定义。
> **本章目标**：定义 4 字段业务接入规则 + 分批执行计划。

### 8.1 现状盘点（Mavis 调研）

**当前所有"动钱"位置**（14 个，全部走 `balance` / `frozenBalance`）：

| # | 位置 | 动作 | 现状改动字段 | BalanceRecord type |
|---|------|------|-------------|-------------------|
| 1 | `order.service.ts:189` | 订单支付 | balance -payAmount | payment |
| 2 | `order.service.ts:333` | 订单退款 | balance +payAmount | refund |
| 3 | `verify-payment/route.ts:100` | 支付验证 | balance -payAmount | (同 1) |
| 4 | `withdrawal.service.ts:55` | 提现申请 | balance -amount, frozenBalance +amount | withdraw_freeze |
| 5 | `withdrawal.service.ts:109` | 提现审核通过 | frozenBalance -amount | withdraw |
| 6 | `withdrawal.service.ts:147` | 提现审核拒绝 | balance +amount, frozenBalance -amount | unfreeze |
| 7 | `admin/withdrawals/route.ts:151` | 管理员审核提现 | frozenBalance -amount | withdraw |
| 8 | `admin/withdrawals/route.ts:218` | 管理员拒绝提现 | balance +amount, frozenBalance -amount | unfreeze |
| 9 | `admin/users/[id]/balance/route.ts:56` | 管理员调账 | balance OR frozenBalance ±amount | admin_adjust |
| 10 | `admin/manual-reward/route.ts:61` | 手动奖励 | balance +amount | manual_reward |
| 11 | `reward.service.ts:88` | 直推奖发放 | balance +amount | referral_reward |
| 12 | `reward.service.ts:165` | 品牌管理奖发放 | balance +amount | brand_bonus |
| 13 | `reward.service.ts:259` | 分红奖发放（5 池）| balance +perUserAmount | dividend_reward |
| 14 | `reward.service.ts:410/447` | 退款扣回奖励/分红 | balance -amount | refund_reward / refund_dividend |
| 15 | `dividend.service.ts:181` | 分红定时结算 | balance +amount | daily_dividend |

**关键发现**：
- ❌ **没有 Vercel Cron**（无 vercel.json 配置）—— `earnings_hold_hours` 这个系统参数定义了但**无任何代码读它**
- ❌ **当前奖励是支付时立即发**（`payOrder` 调 `processOrderRewards`）—— 不是完成时发，hold 缓冲期形同虚设
- ⚠️ `earnings_hold_hours` 是个"未来能力"标记——4 字段接入时**不需要**真正实现 hold 流转（除非走路径 2）

### 8.2 两条实现路径对比（必须先拍板）

#### 路径 1：轻量叠加统计（Mavis 推荐）✅

**核心思想**：4 字段是 `balance` 的"分项标签"——独立累加器，跟 balance 并行记账。

**具体规则**：
- `balance` 仍然是主账户（不改现有逻辑）
- 业务写入 balance 时，**按场景**同步累加 4 字段之一
- 4 字段和 balance **不强求严格一致**（如调账纯改 balance，4 字段不变——这没问题）
- `earnings_hold_hours` **不实现**（奖励直接入 earningsAvailable，跳过 pending）

**字段语义**：
- `consumeBalance` = 累计消费金额（订单支付时 +，退款时 -）
- `earningsPending` = 待结算收益（**路径 1 下永远为 0**，留口子给路径 2）
- `earningsAvailable` = 累计可提现收益（奖励发放时 +，退款扣回时 -）
- `earningsVoided` = 累计作废金额（仅退款扣回时 +）

**优点**：
- 不动现有业务逻辑（每处 balance 变动只 +1-2 行）
- 不需要定时器 / Vercel Cron
- 改造量小，1-2 个 batch 就能上
- 立即可见效果（后台/前端能看到 4 字段累加）

**缺点**：
- 4 字段和 balance 不严格一致（管理调账时只改 balance）
- `earnings_hold_hours` 系统参数变孤儿
- 概念上"4 个账户"其实是"4 个计数器"

#### 路径 2：账户体系重构（完整版，留给 v50+）

**核心思想**：4 字段是**独立账户**，balance 退化为"钱包总览"。

**具体规则**：
- 奖励发放到 `earningsPending`（不是 balance）
- `earnings_hold_hours` 后用 Vercel Cron 把 pending → available
- 提现只能从 `earningsAvailable` 扣（不是 balance）
- 调账时要选 4 字段之一（不能直接改 balance）
- `consumeBalance` 充值专属账户，下单扣这里（不走 balance）

**优点**：
- 真正实现 hold 缓冲期
- 钱有明确"性质"（赚的/充的/花的）—— 合规角度更清晰
- 与 4 字段命名"账户"语义一致

**缺点**：
- **改造量大**（5+ service 文件 + cron 路由 + UI + 测试 + 数据迁移）
- **行为变更**：用户提现可用额度会变（之前可提全部 balance，现在只能提 earningsAvailable）
- **数据迁移风险**：当前所有钱在 balance，要回填到 4 字段之一
- **新功能依赖**：要先有 Vercel Cron 才能跑 hold 流转

### 8.3 Mavis 建议：**先走路径 1，路径 2 留作 v50+**

**理由**：
1. 胡子哥当前最大诉求是"4 个账户有数据可看"（v0.6 派单 + v43-7 Batch 1 都强调"后台可改、可看"）
2. 路径 1 风险最小、立即可上线
3. 路径 2 涉及行为变更（提现额度），需要胡子哥深思熟虑后单独启动
4. 路径 1 不影响路径 2 后续实施（4 字段已经在了，未来切换只是改写入规则）
5. **2 个月后再做路径 2**时，会有真实业务数据做参考

### 8.4 路径 1 下的 4 字段写入规则（推荐方案）

| 场景 | 触发位置 | consumeBalance | earningsPending | earningsAvailable | earningsVoided |
|------|---------|:---:|:---:|:---:|:---:|
| 订单支付 | payOrder / verify-payment | +payAmount | - | - | - |
| 订单退款 | requestRefund | -payAmount | - | - | - |
| 提现申请 | createWithdrawal | - | - | -amount | - |
| 提现审核通过 | reviewWithdrawal(approve) | - | - | - | - |
| 提现审核拒绝 | reviewWithdrawal(reject) | - | - | +amount | - |
| 管理员调账（recharge） | /api/admin/users/[id]/balance type=recharge | +amount | - | - | - |
| 管理员调账（consume_void） | /api/admin/users/[id]/balance type=consume_void | -amount | - | - | - |
| 管理员调账（earnings_add） | /api/admin/users/[id]/balance type=earnings_add | - | - | +amount | - |
| 管理员调账（earnings_void） | /api/admin/users/[id]/balance type=earnings_void | - | - | - | +amount |
| 手动奖励 | /api/admin/manual-reward | - | - | +amount | - |
| 直推奖发放 | createReferralReward | - | - | +amount | - |
| 品牌管理奖发放 | createBrandBonusReward | - | - | +amount | - |
| 分红奖发放（5 池） | createDividendReward | - | - | +perUserAmount | - |
| 分红定时结算 | settleDailyDividends | - | - | +amount | - |
| 退款扣回奖励 | processRefund (refund_reward) | - | - | -amount | - |
| 退款扣回分红 | processRefund (refund_dividend) | - | - | - | +amount |

**核心规则**：
- **consumeBalance**：订单支付 +，退款 -，调账可手动 ±
- **earningsPending**：路径 1 下**永远 0**（留作未来路径 2 启用）
- **earningsAvailable**：所有奖励发放 +，提现申请 -，退款扣回奖励 -，调账可手动 ±
- **earningsVoided**：仅"分红作废"和"调账作废"时 +（退款扣回分红也走 voided，因为分红已沉淀为"收益"，扣回是作废）

**不动的**：`frozenBalance`（提现冻结机制保持不变）

### 8.5 分批执行计划（路径 1 路线图）

| 批次 | 范围 | 改动文件 | 验证 | 预估 |
|------|------|---------|------|------|
| **2.2.b** | 后台调账 type 扩展 + 4 字段写入 + UI 显示 | 1 route + 1 admin 页 + 1 service 工具 | 手动调账 4 种 type → 验证 4 字段累加 | 1.5h |
| **2.2.c** | 订单生命周期自动累加（支付/退款） | 1 service（order.service.ts） | 下单 → 支付 → 验证 consumeBalance；退款 → 验证扣回 | 1h |
| **2.2.d** | 奖励发放/扣回自动累加 | 1 service（reward.service.ts）+ 1 service（dividend.service.ts） | 下单 → 支付 → 验证推荐人 earningsAvailable；退款 → 验证 voided | 1.5h |
| **2.2.e** | 用户端 dashboard 显示 4 字段 | 1-2 个 dashboard 页面 | 登录 → dashboard → 看到 4 字段余额 | 1h |
| **2.2.f** | 流水页面按 4 字段分类 | `/dashboard/balance` + `/admin/users/[id]/balance` | 流水按字段筛选 | 1h |
| **2.2.g** | 测试覆盖 + 文档收尾 | `__tests__/services/*.test.ts` 增量 + 本文档"完成后自评" | CI 跑通 | 1.5h |

**总预估：7.5h**（分 6 个 batch，每个 1-1.5h）

### 8.6 Batch 2.2.b 详细设计（即将派单的第一批）

**目标**：扩展后台调账 API 支持 4 种 type，让管理员能手动往 4 字段写值

**改动文件**：
1. `src/app/api/admin/users/[id]/balance/route.ts` — type 扩展
2. `src/app/admin/users/page.tsx` — 列表加 4 列
3. `src/app/admin/users/[id]/balance/page.tsx` — 详情页加 4 字段卡片
4. `src/lib/utils/balance-fields.ts` — 新工具（4 字段写值 helper）

**新增 type 枚举**（在 API + UI 同步）：
- `recharge` — 后台充值 → balance +=, consumeBalance +=
- `consume_void` — 消费作废（后台强制扣消费）→ balance -=, consumeBalance -=
- `earnings_add` — 手动加收益 → balance +=, earningsAvailable +=
- `earnings_void` — 手动作废收益 → balance -=, earningsVoided +=

**保持不变的**：
- `balance` — 通用余额调账
- `frozenBalance` — 冻结余额调账

**验证脚本**（小金跑）：
```
1. admin → 资金调整 → type=recharge, amount=100, reason="测试充值"
   → 验证 users.balance=原+100, consumeBalance=原+100
2. admin → 资金调整 → type=earnings_add, amount=50, reason="测试加收益"
   → 验证 users.balance=原+50, earningsAvailable=原+50
3. admin → 资金调整 → type=earnings_void, amount=30, reason="测试作废"
   → 验证 users.balance=原-30, earningsVoided=原+30
```

**commit**：`feat(admin): 后台调账 type 扩展 + 4 字段业务接入（v43-7 Batch 2.2.b）`

### 8.7 风险点

1. **数据一致性**：4 字段和 balance 在路径 1 下不严格一致（调账时只改 balance）—— **接受**这个不一致，UI 标注"消费/收益字段仅记录自动场景"
2. **历史数据断层**：v43-7 Batch 2.2 之前没有 4 字段，所有累计为 0 —— **方案 A 不回填**，新数据从 Batch 2.2.b 开始
3. **并发安全**：每处写入都用 `updateMany` + where 防透支（与现有模式一致）
4. **路径 2 切换成本**：如果未来要转路径 2，需要重写所有写入规则（但字段已在，只是改规则）—— 可控

### 8.8 我的疑问点（需胡子哥拍板）

1. ✅/❌ **路径 1 vs 路径 2** —— 走哪条？
2. ✅/❌ **`earningsVoided` 是否包含"退款扣回分红"** —— 我设计是包含（已沉淀收益作废算 voided）
3. ✅/❌ **手动调账时是否要"调账不影响 4 字段"** —— 我设计是 4 种新 type 会同时改 balance 和对应 4 字段
4. ✅/❌ **Batch 2.2.b 是否第一个派单** —— 我建议是（验证 UI + 写入链路 + 调账流程都能跑通）

---

### 章节 8 自评

**我对 Batch 2.2 设计的理解：8/10**

**优势**：
- ✅ 完整调研了 14 个动钱位置
- ✅ 给出了 2 条路径对比 + 我推荐 + 理由
- ✅ 路径 1 下的字段语义、写入规则、分批计划全部明确
- ✅ Batch 2.2.b 第一个派单设计已经能直接给小金执行

**剩余疑问**（已列在 8.8）：
- 4 个拍板点需要胡子哥确认
- 路径 2 的具体实施留给 v50+ 项目

**未覆盖**：
- 用户端 dashboard 显示 4 字段的具体 UI 设计（Batch 2.2.e 阶段再细化）
- 流水页按 4 字段分类的筛选器交互（Batch 2.2.f 阶段再细化）
- 路径 2 的具体业务规则（如调账规则、新用户注册默认字段值）