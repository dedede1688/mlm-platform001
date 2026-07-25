# Batch 4A-3 历史空订单解锁计划与新空值防线设计

> 状态：设计待胡子老师复核
> 日期：2026-07-25
> 等级：P 级（积分、退款、解锁计划和历史生产数据）
> 前置基线：Batch 4A-1 已完成退款升级积分/解锁计划按真实 `orderId` 冲销；Batch 4A-2 已完成退款后资格累计值回滚。

## 1. 背景

Batch 4A-1 把“新产生的升级积分解锁计划”绑定到了真实订单 ID，并在退款时通过 `PointsService.voidUpgradePointsForRefund(orderId, tx)` 按订单冲销相关 `PointsUnlockSchedule`。

但治理总表中仍保留一个风险点：

```text
HV-10：历史 orderId = '' 的旧 PointsUnlockSchedule 无法按订单自动退款冲销
```

Batch 4A-3 的目标不是立刻清掉这些历史数据，而是先完成两个判断：

1. 历史空 `orderId` 数据是否真实存在。
2. 项目现在是否还可能继续产生新的空 `orderId` 解锁计划。

只读审计已经确认：风险成立，但不适合自动清理。

## 2. 已确认事实

### 2.1 生产只读统计结果

本次只读审计未写数据库、未执行 migration、未改生产金额。

生产库 `PointsUnlockSchedule` 现状：

| 项目 | 数值 |
|---|---:|
| 总 schedule 数 | 3 |
| `orderId = ''` schedule 数 | 3 |
| 空白字符 orderId 数 | 0 |
| active schedule 数 | 3 |
| 涉及用户数 | 3 |
| totalPoints 合计 | 7019 |
| unlockedPoints 合计 | 856 |
| remainingPoints 合计 | 6163 |

三条历史 schedule 均为 active，且每个用户当前 `lockedPoints` 与对应 schedule 的 `remainingPoints` 能对上。

### 2.2 历史空 orderId 的来源

历史脚本曾在无法确定原订单 ID 的情况下，为了恢复积分解锁计划，把 `orderId` 写成空字符串。

相关历史来源：

- `docs/archive/scripts-v60/fix-unlock-schedules.ts`
- `docs/派单历史/v57-清历史+修bug.md`

这类数据属于历史修复遗留，不是 Batch 4A-1 后新链路产生的正常数据。

### 2.3 当前源码仍存在新空值入口

当前 `PointsService.createPointsUnlockSchedule` 仍使用兜底写法：

```ts
orderId: data.orderId || ''
```

当前 `UserService.checkAndUpgradeLevel` 仍允许 `sourceOrderId` 缺省，并传入：

```ts
orderId: sourceOrderId ?? ''
```

虽然当前生产主调用入口 `RewardService.processOrderRewards(order.id)` 已传真实 `order.id`，但公共 service 方法仍允许未来调用者漏传订单 ID，重新制造 `orderId = ''` 的 schedule。

这就是 Batch 4A-3 最应该先修的地方。

## 3. 设计目标

Batch 4A-3 只做“防新空值 + 历史处置口径固定”。

完成后应满足：

1. 新创建的升级积分解锁计划必须绑定真实、非空、非空白的订单 ID。
2. 缺失订单 ID 时 fail-closed：不创建 schedule，不增加 lockedPoints，不留下半完成积分状态。
3. `checkAndUpgradeLevel` 在需要创建升级积分/解锁计划时，必须有真实 `sourceOrderId`。
4. 当前三条历史 `orderId = ''` schedule 不自动 void、不自动删除、不自动回填。
5. 退款链路继续只按真实订单 ID 冲销新 schedule。
6. 不执行生产数据写入，不做 migration。
7. 为后续如需人工处理历史 schedule 留下清楚边界。

## 4. 非目标

本批不做以下事情：

- 不自动清理三条历史 `orderId = ''` schedule。
- 不自动把历史空 `orderId` 回填成某个猜测订单 ID。
- 不自动扣减用户 lockedPoints / totalPoints / unlockedPoints。
- 不改变每日积分解锁逻辑。
- 不改变退款金额、退款状态、奖励扣回、分红扣回逻辑。
- 不新增数据库字段或索引。
- 不接入 `LevelSnapshot`。
- 不新增后台 UI。
- 不追溯计算历史订单与历史 schedule 的一一映射关系。

## 5. 推荐业务口径

### 5.1 历史三条 schedule：暂时保留

推荐保留当前三条历史 schedule，继续按原逻辑解锁。

理由：

1. 这三条 schedule 是历史修复脚本产生，不是当前新订单链路产生。
2. 用户当前 `lockedPoints` 与 schedule `remainingPoints` 能对上，说明它们仍承担真实积分锁定状态。
3. 没有可靠订单 ID 快照，无法证明某条 schedule 必然对应某个已退款订单。
4. 用时间、金额、用户订单去“猜测绑定”会造成资金误扣风险。
5. 自动 void 或删除可能让用户积分账不平。

因此本批结论是：

```text
历史 schedule 作为历史合并解锁计划保留；
除非胡子老师后续明确授权人工专项，否则不做生产写入。
```

### 5.2 新 schedule：必须绑定真实订单

从 Batch 4A-3 开始，任何新建 `PointsUnlockSchedule` 的路径都不得再接受空订单 ID。

推荐错误语义：

```text
创建升级积分解锁计划必须绑定真实订单ID
```

这类错误应直接向外抛出，让外层事务回滚。

### 5.3 缺失 orderId 必须 fail-closed

如果升级动作已经走到“要发经销商升级积分并创建解锁计划”这一步，但没有 `sourceOrderId`：

- 不允许先升级成功再补日志。
- 不允许只创建 `PointsRecord` 不创建 schedule。
- 不允许只增加 `lockedPoints` 不创建 schedule。
- 不允许吞掉错误继续完成订单奖励。

正确结果是整笔事务失败并回滚，让问题暴露出来。

## 6. 推荐实现方案

### 6.1 `PointsService.createPointsUnlockSchedule` 增加硬校验

位置：

```text
src/lib/services/points.service.ts
```

建议逻辑：

```ts
const orderId = data.orderId?.trim()
if (!orderId) {
  throw new Error('创建升级积分解锁计划必须绑定真实订单ID')
}
```

之后只写入校验后的 `orderId`，删除：

```ts
orderId: data.orderId || ''
```

注意：校验必须发生在任何写入之前。

### 6.2 `UserService.checkAndUpgradeLevel` 增加上游保护

位置：

```text
src/lib/services/user.service.ts
```

当用户升级到“经销商”并准备发放升级积分/创建解锁计划时，先校验 `sourceOrderId`。

建议原则：

- 可以保留方法参数兼容性，但运行时必须校验。
- 如果本次调用不会创建升级积分/解锁计划，则不因为缺失 `sourceOrderId` 误伤无关路径。
- 如果本次调用会创建升级积分/解锁计划，则缺失 `sourceOrderId` 必须抛错。

这样比单纯把参数改成必填更稳，因为测试和历史调用可能仍覆盖“只检查不升级”的场景。

### 6.3 真实生产调用入口保持不变

当前真实奖励入口已经传入订单 ID：

```text
RewardService.processOrderRewards(orderId)
→ UserService.checkAndUpgradeLevel(userId, order.id)
→ UserService.checkAndUpgradeLevel(referrerId, order.id)
```

Batch 4A-3 不改奖励发放主链路，只给缺失订单 ID 的异常路径加防线。

### 6.4 历史数据只记录，不写库

本批实施不执行任何类似下面的操作：

```sql
UPDATE points_unlock_schedules SET order_id = ...
UPDATE points_unlock_schedules SET status = 'voided' ...
DELETE FROM points_unlock_schedules ...
```

如果后续胡子老师要求处理历史三条 schedule，应另开 P 级人工数据专项，单独设计：

- 是否要逐条人工确认。
- 是否需要导出用户、订单、积分流水、schedule 对账表。
- 是否允许对生产积分做人工调整。
- 是否需要用户可见说明。

## 7. 测试设计

### 7.1 PointsService 单元测试

新增或补充：

1. `createPointsUnlockSchedule` 传 `orderId: ''` 时抛错。
2. `createPointsUnlockSchedule` 传空白字符时抛错。
3. `createPointsUnlockSchedule` 传 `null` 或缺失时抛错。
4. 抛错时不调用 `pointsUnlockSchedule.create`。
5. 抛错时不调用 `user.update` 增加 lockedPoints。
6. 传真实 `orderId` 时仍能创建 schedule 并增加 lockedPoints。

### 7.2 UserService 单元测试

新增或补充：

1. 当用户满足升级为经销商条件且需要发放升级积分时，缺失 `sourceOrderId` 应抛错。
2. 抛错时不得留下部分写入：
   - 不创建升级 `PointsRecord`
   - 不创建 `PointsUnlockSchedule`
   - 不把用户 level 更新成经销商
3. 传真实 `sourceOrderId` 时升级流程仍通过。
4. 不触发升级积分发放的路径不应被误伤。

### 7.3 奖励主链路回归测试

确认：

1. `RewardService.processOrderRewards(orderId)` 仍把真实订单 ID 传入升级检查。
2. 升级品订单付款后仍能创建带真实 `orderId` 的 schedule。
3. 退款时仍能通过 `voidUpgradePointsForRefund(orderId, tx)` 找到并冲销新 schedule。

## 8. 并发与事务要求

本批不新增并发控制模型，但必须遵守现有事务边界：

- 如果 `checkAndUpgradeLevel` 在订单奖励事务中被调用，缺失 `sourceOrderId` 抛错应让整笔订单奖励事务回滚。
- 不允许 catch 后继续。
- 不允许在事务外补建 schedule。
- 不允许在事务外异步修 lockedPoints。

一句话：宁可订单奖励失败，也不能制造一条无法退款追溯的空订单解锁计划。

## 9. 验证要求

实施完成后至少执行：

```powershell
.\node_modules\.bin\vitest.cmd run **tests**/services/points.test.ts
.\node_modules\.bin\vitest.cmd run **tests**/services/user.test.ts **tests**/services/reward.test.ts **tests**/services/order-lifecycle.test.ts
.\node_modules\.bin\vitest.cmd run
.\node_modules\.bin\tsc.cmd --noEmit --project tsconfig.typecheck.json
.\node_modules\.bin\prisma.cmd validate
.\node_modules\.bin\prisma.cmd generate
.\node_modules\.bin\next.cmd build
git diff --check
```

如果测试文件实际路径不同，以仓库现有测试路径为准，但不得跳过资金相关回归测试。

## 10. 小M复审重点

小M只读复审时重点看：

1. 是否仍存在 `orderId || ''`、`sourceOrderId ?? ''` 写入 schedule 的路径。
2. 是否存在 catch 后吞掉“缺失订单 ID”错误的逻辑。
3. 缺失订单 ID 时是否真的没有 `PointsRecord`、`PointsUnlockSchedule`、`user.level`、`lockedPoints` 的半完成写入。
4. 真实订单奖励路径是否仍能传入 `order.id`。
5. 退款冲销路径是否仍按真实 `orderId` 找 schedule。
6. 是否有任何生产数据写入、migration 或历史 schedule 自动清理。

## 11. 风险与取舍

| 风险 | 处理 |
|---|---|
| 历史三条空 `orderId` schedule 仍无法被订单退款自动冲销 | 接受为历史遗留，暂时保留，不猜测处理 |
| 未来调用者漏传订单 ID | 本批通过硬校验 fail-closed |
| 某些旧测试依赖缺省 `sourceOrderId` | 更新测试，让测试符合新资金安全规则 |
| 抛错导致订单奖励失败 | 接受；比生成无法追溯的资金/积分状态更安全 |
| 历史用户积分是否需要人工处理 | 本批不拍板，后续单独 P 级专项 |

## 12. 下一步流程

1. 胡子老师复核本设计。
2. 设计通过后，小酷写 Batch 4A-3 实施计划。
3. 实施计划通过后，小酷写小猫执行提示词。
4. 小猫按提示词实现。
5. 小酷审核小猫结果。
6. 小M独立只读复审。
7. 胡子老师验收。
8. 通过后再同步治理总表、推送、部署。
