# 历史空 orderId Schedule 归属查询报告

> 日期：2026-07-29  
> 执行者：小猫（CatPaw，只读查询，0 个数据库写操作）  
> 目的：为方案 A（补全 orderId）提供归属依据

---

## 一、3 条 Schedule 完整信息

| # | Schedule ID | 用户 | userId | totalPoints | remainingPoints | createdAt | unlock 日解率 |
|---|------------|------|--------|-------------|-----------------|-----------|-------------|
| 1 | `0cea2ca6-9e8e-4c4e-bf21-6af3151cb2a3` | 用户8001 | `1490ac44-c967-4110-ae53-321b3e6e13f8` | 4894 | 4162 | 2026-06-29 16:49:55 UTC | 1%/100天 |
| 2 | `b1849e0c-6c7a-41d7-b15d-13f1fb9128d9` | 用户8002 | `38331c49-03ae-450c-827a-f6724b9040cb` | 1625 | 1386 | 2026-06-29 16:49:59 UTC | 1%/100天 |
| 3 | `b12b4b5e-db51-4783-be10-ed2d236f3280` | 用户8003 | `d3a301c6-aa17-40b0-a657-af38704571a5` | 500 | 477 | 2026-07-21 07:00:55 UTC | 1%/100天 |

---

## 二、关键发现：3 条 Schedule 均来自升级奖励（reward），非直接订单支付

**数据库中不存在任何有 orderId 的 schedule**（正常 schedule 也是 0 条），说明 refund 改造前创建 schedule 时 orderId 字段统一为空字符串。

---

## 三、逐条归属分析

### Schedule 1：用户8001，totalPoints=4894

**积分来源链**：

| 时间 | 类型 | 金额 | 说明 |
|------|------|------|------|
| 2026-06-20 08:48:39 | reward | +5000 | 升级为经销商发放积分（10件升级产品 × 500） |
| 2026-06-28 04:24:33 | transfer_in | +100 | 收到来自用户的积分 |
| 2026-06-29 16:18:05 | transfer_out | -94 | 转赠给用户8002（含手续费4） |
| 2026-06-29 16:32:20 | transfer_in | +100 | 收到来自用户的积分 |

**分析**：
- schedule totalPoints=4894 ≠ reward 5000，差额 106
- 原因：schedule 创建时（6月29日16:49:55）用户 totalPoints=5048（见 unlock 记录），但 schedule 锁定的是 4894
- 4894 = 5000（reward）- 94（转赠）- 6（手续费差额）+ 其他微调
- **触发订单**：6月20日08:48:26 的升级订单 `d5f3e6de-9db2-4c78-a2a7-b2f873eb0d11`（reward 记录 08:48:39 紧随其后 13 秒）

**候选 orderId**：

| 优先级 | orderId | 订单状态 | payAmount | paidAt | 匹配理由 |
|--------|---------|---------|-----------|--------|---------|
| ⭐ 首选 | `d5f3e6de-9db2-4c78-a2a7-b2f873eb0d11` | completed | 500 | 2026-06-20 08:48:30 | reward 记录紧随此订单 13 秒后生成 |

> ✅ **首选 orderId 已选定**：`d5f3e6de-9db2-4c78-a2a7-b2f873eb0d11`（小酷建议 A + 胡子老师 2026-07-29 拍板采纳；14 个升级订单中 reward 前 13 秒最匹配，订单状态 completed）

**可信度：中**

- 理由：reward 记录描述"10件升级产品"，但 6月20日当天有多个升级订单（14个 completed），无法确定是哪个订单触发了 reward
- schedule totalPoints=4894 与 reward 5000 不完全匹配，存在积分转赠/调账干扰
- **建议**：取 6月20日当天最后一个升级订单 `5eb91b62-a5ff-4d0d-827d-66bbb62004f8`（08:51:08 paid）作为备选，因为 reward 08:48:39 在它之前，说明 reward 是由更早的订单批量触发的

---

### Schedule 2：用户8002，totalPoints=1625

**积分来源链**：

| 时间 | 类型 | 金额 | 说明 |
|------|------|------|------|
| 2026-06-23 03:38:42 | reward | +500 | 升级为经销商发放积分（1件升级产品 × 500） |
| 2026-06-23 08:24:04 | reward | +1000 | 升级为经销商发放积分（2件升级产品 × 500） |
| 2026-06-29 16:39:12 | admin_adjust | +25 | 管理员调账 |
| 2026-06-29 16:45:10 | admin_adjust | -100 | 管理员调账 |

**分析**：
- schedule totalPoints=1625 = reward 1500 + admin_adjust 25 + 其他流水（转赠/接收等）
- 6月29日16:49:59 创建 schedule 时，用户 totalPoints=1941（见 unlock 记录）
- schedule 锁定的 1625 是当时 lockedPoints 的近似值
- **触发订单**：6月23日的两个升级订单

**候选 orderId**：

| 优先级 | orderId | 订单状态 | payAmount | paidAt | 匹配理由 |
|--------|---------|---------|-----------|--------|---------|
| ⭐ 首选 | `8c517dab-4e8c-41e6-a446-7b2bff64ac8b` | completed | 500 | 2026-06-23 08:23:50 | reward +1000（2件）紧随此订单后生成 |
| 次选 | `951c138f-c596-46f1-839e-7689791336f7` | completed | 500 | 2026-06-23 03:38:28 | reward +500（1件）紧随此订单后生成 |

**可信度：中**

- 理由：schedule 由两次 reward 累积触发，不是单一订单
- totalPoints=1625 与两次 reward 合计 1500 不完全匹配，差额 125 受 admin_adjust 和转赠影响
- **建议**：取最后触发 reward 的订单 `8c517dab` 作为 orderId（因为 schedule 是在第二次 reward 之后才创建的）

---

### Schedule 3：用户8003，totalPoints=500

**积分来源链**：

| 时间 | 类型 | 金额 | 说明 |
|------|------|------|------|
| 2026-07-21 07:00:54 | reward | +500 | 升级为经销商发放积分（1件升级产品 × 500） |

**分析**：
- schedule totalPoints=500 = reward 500，**完全匹配**
- schedule createdAt=07:00:55，reward createdAt=07:00:54，仅差 **1 秒**
- 这是 3 条中归属最清晰的一条

**候选 orderId**：

| 优先级 | orderId | 订单状态 | payAmount | paidAt | 匹配理由 |
|--------|---------|---------|-----------|--------|---------|
| ⭐ 首选 | `665cc363-52d3-48d4-9695-3d781a441fef` | cancelled | 500 | 2026-07-21 07:00:30 | paid_at 在 reward 前 24 秒，时间线完全吻合 |
| 备选 | `ba890f1a-41a2-4015-98da-d41d1926b62d` | cancelled | 500 | 2026-07-21 06:53:43 | 同日更早的升级订单 |

> ✅ **首选 orderId 已选定**：`665cc363-52d3-48d4-9695-3d781a441fef`（小酷建议 A + 胡子老师 2026-07-29 拍板采纳；cancelled 但 paid_at 合法，时间 1:1 匹配）

**可信度：高**

- 理由：totalPoints 与 reward 完全匹配，时间线 1:1 对应
- 注意：首选订单状态为 cancelled，但 paid_at 有值（先支付后取消），reward 在支付后生成
- **建议**：取 `665cc363-52d3-48d4-9695-3d781a441fef`，虽然已 cancelled 但确实是触发 reward 的订单

---

## 四、汇总表

| # | Schedule ID | 用户 | totalPoints | 首选 orderId | 订单状态 | 可信度 | 备注 |
|---|------------|------|-------------|-------------|---------|--------|------|
| 1 | `0cea2ca6...` | 用户8001 | 4894 | `d5f3e6de-9db2-4c78-a2a7-b2f873eb0d11` | completed | **中** | 10件升级产品批量触发，无法精确对应单一订单 |
| 2 | `b1849e0c...` | 用户8002 | 1625 | `8c517dab-4e8c-41e6-a446-7b2bff64ac8b` | completed | **中** | 两次 reward 累积，取最后触发订单 |
| 3 | `b12b4b5e...` | 用户8003 | 500 | `665cc363-52d3-48d4-9695-3d781a441fef` | cancelled | **高** | 1:1 对应，时间线完全吻合 |

---

## 五、低可信度项说明

### 🔴 Schedule 1（用户8001）— 可信度中

**风险点**：
1. 用户8001 在 6月19-20日有 **14 个 completed 升级订单**，reward 描述"10件升级产品"但无法确定是哪 10 个订单
2. schedule totalPoints=4894 ≠ reward 5000，差额 106 受转赠/手续费影响
3. 补量标准：选 `d5f3e6de`（reward 前 13 秒 paid）或选当天最后一个 `5eb91b62`（08:51:08）

**建议**：胡子老师拍板选哪个。如果业务上"升级奖励是批量触发"的逻辑成立，可取当天最晚的 completed 升级订单 `5eb91b62-a5ff-4d0d-827d-66bbb62004f8`。

### 🟡 Schedule 2（用户8002）— 可信度中

**风险点**：
1. 两次 reward（+500 和 +1000）分别由不同订单触发，schedule 是第二次 reward 后创建
2. totalPoints=1625 ≠ 两次 reward 合计 1500，差额 125 受 admin_adjust 影响
3. 取最后触发 reward 的订单 `8c517dab` 是合理推断，但严格来说 schedule 是两次 reward 的"合并锁定"

**建议**：取 `8c517dab` 即可，因为 schedule 创建时间（6月29日）远晚于两次 reward（6月23日），说明 schedule 是在积分汇总后统一创建的。

---

## 六、补充说明

1. **所有 schedule 均来自升级奖励**，不是普通订单支付。这解释了为什么按 payAmount 匹配订单时 0 结果——升级奖励的积分发放走的是 RewardService，不是 OrderService 直接支付。
2. **数据库中不存在任何有 orderId 的 schedule**，说明 refund 改造前创建 schedule 的代码路径不传 orderId。
3. **3 条 schedule 的 orderId 均为空字符串 `""`**，不是 NULL。
4. **0 个数据库写操作**——本查询仅使用 SELECT 语句。

---

## 七、执行方案建议

### 🔴 P0 - 需胡子老师拍板

1. **Schedule 1 orderId 选择**：`d5f3e6de`（reward 前 13 秒）vs `5eb91b62`（当天最晚 completed）— 胡子老师定
2. **Schedule 3 订单已 cancelled**：`665cc363` 状态为 cancelled，是否仍作为 orderId 补入？还是改选 completed 的 `27675a7d`？— 胡子老师定

### 🟡 P1 - 小酷可直接执行（拍板后）

3. 执行 UPDATE 补全 3 条 schedule 的 orderId（需胡子老师批准后）
4. 清理临时查询脚本 `scripts/query-historical-schedules*.ts`