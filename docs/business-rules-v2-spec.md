# MLM Platform · 业务规则 v2 完整规格书

> **版本**: v60.2 (2026-07-01 落地)
> **维护者**: Mavis
> **依据**: 代码 1:1 反推(每条规则标注对应代码位置 + commit hash)
> **配套**: `docs/v60-盘点报告.md` + `AGENTS.md` 铁律 12「业务决策以本文档为准」

---

## 📖 阅读说明

- **规则 = 业务上「应该发生什么」**
- **代码位置 = 当前实现「实际怎么写」**
- **commit = 实现该规则的版本节点**

任何冲突:**业务规则文档优先**(铁律 12)。改动需胡子哥拍板 → 同步本文档 + 代码。

---

## 1. 会员体系(8 级)

| 等级 | 名称 | 升级条件 |
|------|------|----------|
| 1 | 游客 | 默认 |
| 2 | 会员 | 注册即可 |
| 3 | 经销商 | 见 §3 升级规则 |
| 4 | 主任 | 同上 |
| 5 | 经理 | 同上 |
| 6 | 总监 | 同上 |
| 7 | 总裁 | 同上 |
| 8 | 董事 | 同上 |

> ⚠️ 实际 level 字段值范围 1-7(代码 `MEMBER_LEVELS` 枚举),等级 8「董事」对应 `level=7`。本文档用「等级名」描述,代码用 `level` 数值。

**代码**:
- `prisma/schema.prisma:18` — `level Int @default(1) @map("level")`
- `src/lib/constants.ts:MEMBER_LEVELS` — 枚举定义

---

## 2. 双轨制关系(直推 + 安置)

### 2.1 直推关系(`referrerId`)
- **规则**:用户注册时填的「推荐人」字段,永久绑定,不改变
- **作用**:直推奖发放依据
- **代码**:`prisma/schema.prisma:19` — `referrerId String? @map("referrer_id")`

### 2.2 安置关系(`parentId` + `position`)
- **规则**:三三复制滑落 — 上级有 3 个位置(1, 2, 3),按 BFS 顺序填充
- **算法**:从上到下、从左到右找第一个空位
- **代码**:`src/lib/services/user.service.ts:findPlacementPosition`

---

## 3. 升级规则(§3 业务规则文档 §7.1)

### 3.1 触发时机
- 订单支付成功且含**升级品**(`isUpgradeProduct=true`)
- **代码**:`src/lib/services/reward.service.ts:336-356` — `checkUpgradeFromOrder`

### 3.2 升级条件(纯销售额驱动)
| 等级 | 升级销售额(¥) | 默认配置 |
|------|---------------|----------|
| 经销商(3) | 任意升级品订单 | - |
| 主任(4) | 50,000 | `upgrade.director.sales_amount` |
| 经理(5) | 100,000 | `upgrade.manager.sales_amount` |
| 总监(6) | 200,000 | `upgrade.supervisor.sales_amount` |
| 总裁(7) | 500,000 | `upgrade.president.sales_amount` |
| 董事(8) | 1,000,000 | `upgrade.board.sales_amount` |

### 3.3 升级时的奖励
- **发放积分**:`箱数 × points_per_box`(默认 500 积分/箱)
- **创建释放计划**:`daily_unlock_rate` 默认 0.01(1%/天 → 100 天)
- **代码**:`src/lib/services/user.service.ts:149-189` — 升级事务

**commit**:
- 升级规则修复 + 审计日志:`846911b` (v52)
- 积分事务原子化(防积分凭空多出):`289ac3d` (v55.1)

---

## 4. 直推奖(20%)

### 4.1 触发
- 订单 `status='paid'` → `RewardService.processOrderRewards` → `createReferralReward`

### 4.2 计算公式
```
amount = orderAmount × 0.20
```

### 4.3 发放条件
- **推荐人必须购买过 ≥1 件升级品**(`upgradeProductCount >= 1`)
- 否则:**不发放**,返回 `{ unlockRequired: true, amount: orderAmount * 0.20 }`,前端展示 Toast 提示「购买升级品解锁推荐奖」

### 4.4 资金记账
- `balance` += amount
- `earningsAvailable` += amount
- 创建 `Reward(type='referral', level=1, status='paid')`
- 创建 `BalanceRecord(type='referral_reward', sourceType='reward')`

**代码**:`src/lib/services/reward.service.ts:57-112` — `createReferralReward`
**commit**:奖励发放逻辑 `218d2cf` (v46 系列) + Toast 触发 `a72bba0` (v46.9)

---

## 5. 品牌管理奖(20% v4 完整版)

> **v4 规则**:安置链 + 轮换 + 沉淀 + 层数限制(v47 业务 v2 决策)

### 5.1 触发
- 订单 `status='paid'` **且不含升级品**(`!hasUpgradeProduct`)
- 普通消费订单才能触发品牌管理奖
- **代码**:`src/lib/services/reward.service.ts:314-316`

### 5.2 推荐人层级 → 最大层数

| 推荐人层级 | 直推经销商数 | 最大层数 |
|------------|--------------|----------|
| 董事(level 7) | 任意 | 10 层 |
| 主任(4)~总裁(6) | 任意 | 10 层 |
| 经销商(3) | ≥2 | 10 层 |
| 经销商(3) | 1 | 4 层 |
| 经销商(3) | 0 | 2 层 |
| 会员(2) | 任意 | 10 层 |
| 游客(1) | - | 0(不发) |

**v60 step3 G**:`A 是会员时跳过 A,从安置链上第 1 个经销商开始发放`

**代码**:`src/lib/services/reward.service.ts:44-54` — `computeMaxLayers`

### 5.3 轮换算法(targetLayer)
```
paidCount = 该买家的「已支付+已发货+已完成」订单数
targetLayer = ((paidCount - 1) % 10) + 1
```
- 第一个订单发到第 1 层
- 第二个订单发到第 2 层
- ...
- 第 11 个订单发回第 1 层(轮换)

**代码**:`src/lib/services/reward.service.ts:125-128`

### 5.4 安置链查找
- 从买家 `parentId` 向上找(`currentId = parentId`),遍历到 `maxLayers`
- 跳过 level < 经销商(level 3)的用户
- 找到第 `targetLayer` 个经销商即为受益人

**代码**:`src/lib/services/reward.service.ts:8-42` — `findBrandBonusRecipients`

### 5.5 沉淀机制
- 如果 `recipients[targetLayer]` 为空(即安置链上该层没有经销商)
- **不发放**,但记录 operationLog:`action='BRAND_BONUS_SINK'`,金额累计到「沉淀池」
- 业务决策:沉淀资金暂时记账,后续可由 admin 手动处理

**代码**:`src/lib/services/reward.service.ts:133-147`

### 5.6 资金记账
- 受益人 `balance` += `orderAmount × 0.20`
- 受益人 `earningsAvailable` += amount
- 创建 `Reward(type='brand_bonus', level=targetLayer, fromUserId=buyerId)`
- 创建 `BalanceRecord(type='brand_bonus', sourceType='reward')`

**代码**:`src/lib/services/reward.service.ts:149-191`

**commit**:
- 业务 v2 决策:`878f1c6` (v47)
- 文案 + 动态百分比:`9a78dbc` (v50 G)
- A 是会员跳过 A:`d000b53` (v60 step1-3 G)

---

## 6. 分红奖(v2 5 级独立池)

> **v2 重大决策**:5 级独立池替代 v1 单池累加算法(v50 B)
> **v1 → v2 差异**:v1 把总池按等级比例分,经理也吃主任池;v2 每级独立计算自己池,互不干扰

### 6.1 触发
- 每日 Vercel Cron `0 0 * * *` → `/api/cron/daily-tasks` → `DividendService.settleDailyDividends`
- **不能**订单支付时触发(订单级触发在 `RewardService.createDividendReward` 见 §6.5)

### 6.2 5 级独立池比例(默认 5% × 5 = 25%)
| 池 | 等级 | 默认比例 | 配置 key |
|----|------|---------|---------|
| 主任池 | 主任(4) | 5% | `dividend.director.rate` |
| 经理池 | 经理(5) | 5% | `dividend.manager.rate` |
| 总监池 | 总监(6) | 5% | `dividend.supervisor.rate` |
| 总裁池 | 总裁(7) | 5% | `dividend.president.rate` |
| 董事池 | 董事(8) | 5% | `dividend.board.rate` |

### 6.3 5 个「包含上级」开关
| 池 | 默认 | 配置 key |
|----|------|---------|
| 主任池包含上级 | false | `dividend.director.include_upstream` |
| 经理池包含上级 | false | `dividend.manager.include_upstream` |
| 总监池包含上级 | false | `dividend.supervisor.include_upstream` |
| 总裁池包含上级 | false | `dividend.president.include_upstream` |
| 董事池包含上级 | false | `dividend.board.include_upstream` |

**业务含义**:
- `false` → 仅本级用户平分该池(如主任池只发给主任)
- `true` → 本级 + 更高级用户(不含董事,董事池独占)平分该池(如经理池 true → 经理+总监+总裁平分)

### 6.4 算法流程(`DividendService.settleDailyDividends`)

```
1. 检查今日是否已结算(否则抛错)
2. 找出当日所有 paid 订单
3. 计算 totalOrderAmount = Σ order.payAmount
4. 计算 5 个独立池总额:poolTotal[level] = totalOrderAmount × rate[level]
5. 总分红池 = Σ poolTotal[3..7]
6. 找出所有 level >= 3 且 status='active' 的用户(eligibleUsers)
7. 按 [7, 6, 5, 4, 3] 顺序处理每级:
   for level in [7, 6, 5, 4, 3]:
     if level == 7: candidates = level=7 用户
     elif include_upstream: candidates = level ∈ [level, level+1, ..., 6] 用户
     else: candidates = level = level 用户
     if candidates.length > 0:
       perPerson = poolTotal[level] / candidates.length
       userDividends[userId][level] = perPerson
8. 每个用户总分红 = Σ 所在池的 perPerson
9. 创建 Dividend 记录 + 更新 balance + earningsAvailable
10. 创建 BalanceRecord(type='daily_dividend') + Reward(type='dividend')
```

**代码**:`src/lib/services/dividend.service.ts:20-286` — `settleDailyDividends`

### 6.5 订单级分红(`RewardService.createDividendReward`)

⚠️ **注意**:订单支付时也会触发分红发放,与每日结算逻辑类似但**实时性强**:
- 沿**推荐链**(不是安置链)向上找 level >= 主任 的用户
- 每个用户可同时拿多个池的分红

**代码**:`src/lib/services/reward.service.ts:193-288` — `createDividendReward`

### 6.6 资金记账
- 受益人 `balance` += amount
- 受益人 `earningsAvailable` += amount
- 创建 `Dividend(userLevel, totalPool, dividendDate)`
- 创建 `Reward(type='dividend', status='paid')`
- 创建 `BalanceRecord(type='daily_dividend' 或 'dividend_reward')`

**commit**:
- 5 级独立池 v2 算法:`e2bf304` (v50 B)
- 测试同步:`a7b901e` (v54.1)

---

## 7. 积分系统

### 7.1 积分发放
- **触发**:升级品订单支付完成 + 用户升级为经销商时
- **计算**:`积分 = 升级品箱数 × points_per_box`(默认 500/箱)
- **代码**:`src/lib/services/user.service.ts:151-152`

### 7.2 积分每日释放(`upgrade.daily_unlock_rate`)
- **默认比例**:0.01 (1%/天)
- **释放天数**:自动计算 = `Math.ceil(1 / rate)`
  - 1%/天 → 100 天
  - 2%/天 → 50 天
  - 0.5%/天 → 200 天
- **每日触发**:Vercel Cron → `PointsService.dailyUnlock`
- **代码**:`src/lib/services/points.service.ts:215-251`

### 7.3 积分流转
- **总积分**(`totalPoints`)— 累计发放
- **已解锁积分**(`unlockedPoints`)— 可用余额部分
- **锁定积分**(`lockedPoints`)— 仍在释放中

### 7.4 积分使用
- **购物抵扣**:订单结算时选择使用积分
- **积分转赠**(`points.transfer`):支持用户间转赠,扣手续费(默认 10%)
  - 开关:`feature.points_transfer_enabled`
  - 手续费:`points.transfer_fee_percent`
- **代码**:`src/app/api/points/transfer/route.ts` + `src/lib/services/points.service.ts:78`

**commit**:
- 积分转赠前端表单:`dc5599f` (v56.2)
- dailyUnlock 补通知:`a9160b1` (v57.4)

---

## 8. 4 字段余额体系(v43-7 Batch 2.2)

> **核心决策**:`balance` 字段太单一,拆成 4 个独立字段,精确记录每一笔钱的性质。

### 8.1 4 字段定义
| 字段 | 中文 | 来源 | 用途 |
|------|------|------|------|
| `balance` | 余额(综合) | - | 总可用余额显示 |
| `consumeBalance` | 消费余额 | admin 充值 + 退款入账 | 仅用于消费 |
| `earningsPending` | 待结算收益 | (预留) | 缓冲期未到账的收益 |
| `earningsAvailable` | 可提现收益 | 奖励 + 分红入账 | 可提现 |
| `earningsVoided` | 累计作废 | 退款扣回的收益 | 审计 |

### 8.2 字段联动
- `balance` = `consumeBalance + earningsAvailable`(近似,实际还有 frozenBalance)
- 退款扣回:奖励 `earningsAvailable--`,分红 `earningsVoided++`
- 管理员调账:6 种 type 任意增减

### 8.3 管理员调账 type
```typescript
const VALID_TYPES = ['balance', 'frozenBalance', 'recharge', 'consume_void', 'earnings_add', 'earnings_void']
```
**代码**:`src/app/api/admin/users/[id]/balance/route.ts:10`
**commit**:`d000b53` (v60 step1-3,earnings_void 独立 type)

### 8.4 流水类型
| type | 场景 |
|------|------|
| `payment` | 订单支付 |
| `refund` | 订单退款 |
| `reward` | 奖励发放 |
| `withdraw_freeze` | 提现冻结 |
| `withdraw` | 提现打款 |
| `unfreeze` | 提现拒绝解冻 |
| `admin_adjust` | 管理员调账 |
| `manual_reward` | 手动奖励 |
| `refund_reward` | 退款扣回奖励 |
| `refund_dividend` | 退款扣回分红 |
| `daily_dividend` | 每日分红 |
| `referral_reward` | 直推奖 |
| `brand_bonus` | 品牌管理奖 |
| `dividend_reward` | 分红奖(订单级) |

---

## 9. 提现规则

### 9.1 申请条件
- 最低金额:`withdrawal.min_amount`(默认 ¥100)
- 最高金额:`withdrawal.max_amount`(默认 ¥50,000/笔)
- 每日限制:`withdrawal.daily_limit`(默认 3 次/天)

### 9.2 审核流程
- 申请 → `status='pending'`
- 审核通过 → `status='approved'` → 实际打款 → `status='completed'` + `paidAt`
- 审核拒绝 → `status='rejected'` + `rejectReason` + 解冻余额
- 批量审核:`/api/admin/withdrawals/batch-review`

### 9.3 拒绝理由模板
- 7+ 个可配置模板(`/api/admin/withdrawal-templates`)
- 支持自定义原因
- 写入 `WithdrawalAuditLog`

### 9.4 资金流
- 申请时:`balance-- → frozenBalance++`(冻结)
- 通过打款:`frozenBalance--`(从冻结扣)
- 拒绝:`frozenBalance-- → balance++`(解冻回余额)

**代码**:`src/lib/services/withdrawal.service.ts` + `withdrawal-audit-log.service.ts`
**commit**:批量审核 + 拒绝模板:`621de61` (v46.3)

---

## 10. 退款规则

### 10.1 退款窗口
- 退款期限:`refund_window_days`(默认 7 天,从发货起算)

### 10.2 退款流程
```
用户申请 → admin 审核 → admin 完成
       refund_submitted 通知    refund_review 通知    refund_completed 通知
```

### 10.3 资金回退
- 退 `consumeBalance`(消费余额)
- 退 `unlockedPoints`(已解锁积分)
- 扣回奖励:`earningsAvailable--`
- 扣回分红:`balance--` + `earningsVoided++`
- 订单状态:`REFUNDED`

### 10.4 通知链路
- `refund_submitted` — 申请时
- `refund_review(result)` — 审核通过/拒绝
- `refund_completed` — 完成退款

**代码**:`src/lib/services/order.service.ts:requestRefund` + `OrderLifecycleService`
**commit**:
- 退款审核+完成通知:`455e77f` (v46.12)
- 退款申请通知:`3c9e0be` (commit `3c9e0be`)

---

## 11. 通知系统(v46 全链路)

### 11.1 通知模板(7+ 种)
- `order_paid` — 订单支付
- `order_shipped` — 订单发货
- `order_completed` — 订单完成
- `order_cancelled` — 订单取消
- `withdrawal_result` — 提现审核结果
- `refund_submitted` — 退款申请
- `refund_review` — 退款审核
- `refund_completed` — 退款完成
- `balance_change` — 余额变动(admin 调账触发)
- `points_unlock` — 积分解锁

### 11.2 通知渠道
- **当前只支持站内信**(`channel='in_app'`)
- 短信 / 邮件:**胡子哥 2026-07-01 拍板不做**(等真实业务需求时再说)

### 11.3 通用通知 + 系统公告
- `NotificationBatch` 表记录批量发送
- 通用通知:`send to specific userId`
- 系统公告:`send to all users`
- 阅读统计:`readCount / recipientCount`

**代码**:
- 模板:`prisma/seed.ts`(7 个种子模板)
- 渠道:`src/lib/notification/sendInApp.ts`
- 历史:`src/app/admin/notification-history/`

**commit**:v46.4-v46.12 完整链路

---

## 12. 角色权限体系(5 角色)

| 角色 | 中文 | 主要权限 |
|------|------|---------|
| `super_admin` | 超级管理员 | 全部 |
| `goods_admin` | 商品管理员 | 商品/订单/分类/轮播图 |
| `finance_admin` | 财务管理员 | 财务/提现/退款 |
| `support_admin` | 客服管理员 | 用户/推荐树/通知发件箱 |
| `auditor` | 审计员 | 只读 dashboard + 操作日志 |

**代码**:
- 菜单配置:`src/lib/admin-menu.ts`
- 鉴权工具:`src/lib/utils/admin-auth.ts` — `verifyPermission`
- 中间件:`src/middleware.ts` — JWT 签名验证 + pathRoleMap

**审计**:`docs/admin-api-audit.md` — 50/50 = 100% 鉴权完整率

---

## 13. 系统参数(33 项 7 分组)

详见 `src/lib/config/system-parameters.ts`,分组:
- `time` (4 项) — 自动确认/收益缓冲/退款窗口/分红周期
- `reward` (2 项) — 直推率 / 品牌管理率
- `dividend` (11 项) — 5 个独立池比例 + 5 个包含上级开关 + 1 个其他
- `upgrade` (8 项) — 升级门槛 + 积分设置 + 释放率
- `feature` (1 项) — 积分转赠开关
- `points` (1 项) — 积分转赠手续费
- `withdrawal` (4 项) — 最低/最高/每日限制/手续费

**后台管理**:`/admin/settings/system-parameters`
**commit**:33 项扩展 `8b3dda9` (v50 C)

---

## 14. 业务规则变更流程(铁律 12 配套)

任何业务规则改动,必须:

1. **业务讨论**:胡子哥拍板(口头/微信)
2. **同步本文档**:在对应章节修改 + 更新「最后更新」日期
3. **代码实现**:派单给猫爪,标注 commit hash
4. **测试覆盖**:`__tests__/services/<service>.test.ts` 加 case
5. **部署上线**:build + push + `git log origin/main` 验证(铁律 1)
6. **文档回填**:commit 链接加到对应章节

---

## 15. 关键 commit 时间线

| 版本 | commit | 关键业务规则 |
|------|--------|--------------|
| v17 | `84bafac` | 注册 500 修复(非业务规则) |
| v43-7 | `788de58` `27971da` `94ab392` `7ad7102` `ceeb28f` `541f3aa` | 4 字段余额体系 |
| v46.3-v46.12 | `621de61` `4cb4105` `5ed3edf` `41f542a` `c5dcbe7` `737023b` `febe85f` `aafcc40` `830c070` `0748bf7` `6047d77` `455e77f` | 通知系统全链路 |
| v47 | `878f1c6` `dbbca22` | 业务规则 v2 + 权限白名单 |
| v48 | `e3d2d28` | 基础功能 + 支付密码 + 提现申请 |
| v50 B | `e2bf304` | 分红 5 级独立池 |
| v50 C | `8b3dda9` | 33 项系统参数 |
| v50 E | `90f1f64` | 会员双轨制 UI |
| v50 F | `218d2cf` | 推荐奖未解锁 Toast |
| v50 G | `9a78dbc` | 品牌管理奖文案 + 动态百分比 |
| v50 I | `9a232ca` | description 4 字段标签 |
| v50 L | `0e311c2` | 自动确认收货 cron |
| v50.1-K | `0be90dc` | 支付密码强制生效 |
| v50-n-1 | `efab44c` | OrderService 拆 lifecycle |
| v50-n-2 | `85a7b36` | OrderService 拆 notification |
| v50 O | `dd35842` | 收益明细过滤 |
| v52 | `846911b` | 升级规则修复 + 审计日志 |
| v54 | `8fc5e3a` | 业务规则闭环 D+H+M+O2 |
| v54.1 | `a7b901e` `270c027` | 分红测试同步 + 通知模板补齐 |
| v55.1 | `289ac3d` | 积分事务原子化 |
| v55.2 | `b04c807` | middleware 真正验证 JWT |
| v56.1 | `6010fd7` | 改密 + 找回密码 |
| v56.2 | `dc5599f` | 积分转赠前端 |
| v57.1-v57.4 | `76c0658` `d0ede1b` `87c07b2` `95aeeca` `f33976c` `a9160b1` | 历史清理 + dailyUnlock 通知 |
| v58 | `7329405` | 积分明细 tab 改版 |
| v60 step1-3 | `d000b53` | earnings_void 独立 type + G 收尾 |
| v60 step2 | `3eff22f` | format4FieldDelta 补齐 |
| v60.1 | `97088a6` | 文档治理收尾(本规格书落地) |

---

**维护说明**:任何业务规则改动必须更新本文档 + 在 git commit message 中引用章节号。版本号采用 `v60.x.y` 递增。