# Batch 4A-2 退款资格累计值回滚设计

> 状态：设计待胡子老师复核
> 日期：2026-07-25
> 等级：P 级（退款、等级资格、销售额与升级品数量会影响资金资格）
> 前置基线：Batch 4A-1 已完成退款升级积分和解锁计划冲销

## 1. 胡子老师已确认的推荐规则

本批采用以下业务口径：

- 等级继续执行“只升不降”。
- 退款订单不再贡献资格累计值。
- 回滚买家销售额 `directSalesAmount`。
- 回滚推荐人销售额 `directSalesAmount`。
- 回滚买家升级品数量 `upgradeProductCount`。
- 直推经销商数 `directDistributorCount` 不再依赖历史累加，按当前真实下级等级重算。
- 本批不追溯历史高等级已经影响过的后续奖励，后续如需处理另开专项。

这意味着：退款后用户等级可以保留，但用于未来继续升级判断的销售额和升级品数量必须回到“只由未退款有效订单贡献”的状态。

## 2. 已确认现状

### 2.1 付款后写入资格累计值

`RewardService.processOrderRewards(orderId)` 在订单奖励完成后调用 `checkUpgradeFromOrder`。

`checkUpgradeFromOrder` 当前行为：

- 所有已支付订单都会给买家增加 `directSalesAmount`。
- 升级品订单会给买家增加 `upgradeProductCount`。
- 有推荐人的订单会给推荐人增加 `directSalesAmount`。
- 升级品订单会检查买家和推荐人是否升级。
- 普通订单会检查推荐人是否升级。

对应源码：

- `src/lib/services/reward.service.ts:384`
- `src/lib/services/reward.service.ts:422`
- `src/lib/services/user.service.ts:116`
- `src/lib/services/user.service.ts:236`
- `src/lib/services/user.service.ts:247`

### 2.2 退款后未回滚资格累计值

`OrderLifecycleService.requestRefund(orderId)` 当前退款事务已经完成：

- 退库存。
- 退消费积分。
- 退余额。
- 冲销升级积分和解锁计划。
- 扣回已发奖励和分红。
- 更新订单状态为 `refunded`。

但它没有回滚：

- `directSalesAmount`
- `upgradeProductCount`
- `directDistributorCount`
- `level`

对应源码：

- `src/lib/services/order-lifecycle.service.ts:211`
- `src/lib/services/order-lifecycle.service.ts:293`
- `src/lib/services/order-lifecycle.service.ts:296`

### 2.3 业务规则已有“只升不降”

`docs/business-rules.md:333` 明确写有“只升不降”。因此 Batch 4A-2 不做自动降级，不把“退款后 level 保留”判定为 bug。

### 2.4 当前缺少订单发生时的推荐人快照

当前 `orders` 表没有记录订单支付时的推荐人 ID；`rewards` 表也不能覆盖所有“推荐人销售额增加”的情况，因为直推奖有资格门槛，部分订单可能增加了推荐人销售额但没有生成直推奖记录。

因此本批不得采用“按当前推荐人简单 decrement 一笔”的粗暴方式。它在用户后续更换推荐关系时会扣错人。

## 3. 设计目标

Batch 4A-2 只解决“退款后资格累计值不再虚高”的问题。

本批完成后：

1. 退款订单不再贡献买家销售额。
2. 退款订单不再贡献推荐人销售额。
3. 退款升级品不再贡献买家升级品数量。
4. 直推经销商数由当前真实下级等级重算，不再相信历史累加值。
5. 用户等级仍然只升不降。
6. 退款事务失败时不得出现“钱退了，但资格累计值没回滚”的半完成状态。
7. 不新增数据库表，不执行 migration。
8. 不追溯历史后续奖励。

## 4. 非目标

本批不做以下事情：

- 不自动降低用户 `level`。
- 不追溯重算历史已经发出的后续订单奖励。
- 不修改奖励比例、分红比例、升级门槛。
- 不新增“订单推荐人快照”字段。
- 不做全量历史数据清洗。
- 不修改后台 UI。
- 不修改提现、余额、积分解锁之外的资金链路。

## 5. 推荐实现方案

### 5.1 新增资格累计值重算服务

在 `UserService` 中新增面向退款链路的重算方法：

```ts
static async recomputeQualificationStatsForUsers(userIds: string[], tx?: Prisma.TransactionClient): Promise<void>
```

职责：

1. 对输入用户去重。
2. 对每个用户重新计算 `directSalesAmount`：
   - 该用户自己的有效订单实付金额；
   - 当前直推下级的有效订单实付金额。
3. 对每个用户重新计算 `upgradeProductCount`：
   - 该用户自己的有效升级品订单数量。
4. 对每个用户重新计算 `directDistributorCount`：
   - 当前 `referrerId = user.id` 且 `level >= DISTRIBUTOR` 的用户数量。
5. 一次性写回 `user` 表。

有效订单定义：

```text
status in ['paid', 'shipped', 'completed']
rewardStatus = 'completed'
```

排除订单：

```text
status in ['pending', 'cancelled', 'refunded']
```

说明：

- 使用重算而不是 decrement，可以避免重复退款、并发退款、历史值已脏时越修越歪。
- 重算以当前推荐关系为准。由于当前没有订单推荐人快照，这是本批在不做 migration 前提下最稳的口径。
- 若未来要按“订单发生时推荐关系”精确追溯，需要单独新增订单推荐快照字段，另开 P 级数据库批次。

### 5.2 退款链路中调用重算

在 `OrderLifecycleService.requestRefund(orderId)` 的同一个事务中：

1. 读取订单时补充：
   - `user.referrerId`
   - `items.product.isUpgradeProduct`
2. 原退款资金步骤保持现有顺序。
3. 先完成库存、积分、余额、升级积分冲销、奖励分红扣回。
4. 把订单状态更新为 `refunded`。
5. 在事务末尾调用资格累计值重算：
   - 买家本人；
   - 买家当前推荐人；
   - 订单奖励或分红涉及的接收人中需要校正者可选加入，但本批最低要求是买家和买家当前推荐人。

推荐顺序：

```text
退款资金处理
→ 更新订单 status = refunded
→ recomputeQualificationStatsForUsers([buyerId, currentReferrerId])
→ 事务提交
```

这样重算查询能在同一事务内看到订单已经退款，避免状态和累计值短暂不一致。

### 5.3 不做自动降级

`recomputeQualificationStatsForUsers` 不修改 `level`。

理由：

- 项目业务规则写明“只升不降”。
- 自动降级会影响后续奖励资格、分红资格、用户权益和历史解释成本。
- 当前没有 LevelSnapshot 投入使用，无法低风险恢复“退款前/退款后”的等级演进链。

但回滚累计值后，用户未来继续升级时必须基于新的 `directSalesAmount` 和 `upgradeProductCount` 判断。

### 5.4 直推经销商数重算口径

`directDistributorCount` 只表达当前真实状态：

```text
当前下级中 level >= DISTRIBUTOR 的人数
```

它不再表达“历史上通过某订单给我贡献过的经销商人数”。

由于等级只升不降，如果一个下级已经升为经销商，即便导致升级的订单后来退款，该下级仍是经销商，推荐人的 `directDistributorCount` 仍会计入这个下级。这与“只升不降”一致。

## 6. 并发与失败处理

### 6.1 事务边界

资格累计值重算必须纳入退款事务。不得在事务外异步执行。

禁止模式：

```text
退款事务提交成功
→ try/catch 异步重算资格累计值
→ 重算失败只打日志
```

这种模式会留下“钱已退、资格未退”的脏数据。

### 6.2 重复退款

`requestRefund` 当前只允许 `paid` 或 `shipped` 状态进入退款。订单状态变为 `refunded` 后，第二次退款应被状态校验拦住。

Batch 4A-2 新增测试必须证明：

- 第二次退款不会再次改变累计值。
- 资格累计值重算是幂等的。

### 6.3 数据已脏时的行为

如果某用户现有 `directSalesAmount`、`upgradeProductCount` 或 `directDistributorCount` 已经不准，重算会把它改回当前有效订单推导出的值。

这属于预期行为，不是破坏用户资金。因为这些字段是资格统计字段，不是余额字段。

## 7. 测试设计

实施必须先写失败测试，再写实现。

### 7.1 用户服务单测

新增或扩展 `__tests__/services/user.test.ts`：

1. `recomputeQualificationStatsForUsers` 会把退款订单排除在买家 `directSalesAmount` 外。
2. `recomputeQualificationStatsForUsers` 会把当前直推下级有效订单计入推荐人 `directSalesAmount`。
3. `recomputeQualificationStatsForUsers` 会把退款升级品订单排除在 `upgradeProductCount` 外。
4. `recomputeQualificationStatsForUsers` 会按当前下级 `level >= DISTRIBUTOR` 重算 `directDistributorCount`。
5. 输入重复 userId 时只写一次。

### 7.2 退款链路单测

扩展 `__tests__/services/order-lifecycle.test.ts`：

1. 升级品订单退款后，买家 `directSalesAmount` 和 `upgradeProductCount` 重算。
2. 普通订单退款后，买家和推荐人 `directSalesAmount` 重算。
3. 退款后 `level` 保持不变。
4. 退款事务中重算失败时，订单不得变为 `refunded`。
5. 第二次退款被状态校验拒绝，不重复改变累计值。

### 7.3 回归验证

必须跑：

```powershell
.\node_modules\.bin\vitest.cmd run __tests__/services/user.test.ts __tests__/services/order-lifecycle.test.ts
.\node_modules\.bin\vitest.cmd run
.\node_modules\.bin\tsc.cmd --noEmit --project tsconfig.typecheck.json
.\node_modules\.bin\next.cmd build
git diff --check
```

不得使用 `npx`。

## 8. 验收标准

代码完成后，必须满足：

1. 新增测试先红后绿，有首次失败证据。
2. 全量测试通过。
3. TypeScript typecheck 0 错误。
4. production build 通过。
5. 不新增 migration。
6. 不改 `level` 降级逻辑。
7. 不改奖励比例、分红比例、升级门槛。
8. 不改后台 UI。
9. 小酷审核通过。
10. 小M 独立只读复审通过。
11. 胡子老师批准后才允许 push 和部署。

## 9. 风险与后续专项

### 9.1 历史推荐关系无法精确追溯

当前订单没有保存“支付时推荐人”。Batch 4A-2 采用当前推荐关系重算。

如果未来业务要求精确还原订单发生时的推荐关系，需要新增订单级推荐快照字段，并对支付链路、退款链路和历史订单迁移另开 P 级数据库批次。

### 9.2 历史高等级后续奖励不追溯

本批不重新计算已经发生的后续奖励。原因：

- 涉及多订单、多奖励、多分红池、多用户余额。
- 当前“等级只升不降”规则下，追溯扣回缺少业务依据。
- 强行扩大范围会显著增加资金事故风险。

建议治理总表保留该风险，后续如有真实生产损失再按专项审计处理。

### 9.3 LevelSnapshot 仍未投入使用

`LevelSnapshot` 当前只是 schema 存在，未形成每日快照链路。Batch 4A-2 不启用它。

后续若要做更精细的等级审计，可以另开 Batch 4A-4：LevelSnapshot 启用与等级资格审计。

## 10. 分批边界

Batch 4A-2 实现批次建议只包含：

1. `UserService` 新增资格累计值重算方法。
2. `OrderLifecycleService.requestRefund` 接入同事务重算。
3. 对应单元测试和回归测试。

不得顺手处理：

- 历史生产数据清洗。
- 等级降级。
- 新增数据库字段。
- 后台页面。
- 奖励算法重构。
- 分红算法重构。

这批要做小、做稳，像给账本装一个防回弹的小卡扣，而不是把整台机器拆开重造。
