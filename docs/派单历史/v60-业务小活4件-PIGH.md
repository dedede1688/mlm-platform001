# v60 派单存档：业务小活 4 件（P + I + G + H）

> **派单时间**：2026-06-30
> **派单人**：Mavis
> **执行人**：猫爪
> **背景**：v57 收尾 + 项目清单重整后，从剩 12 个待办里挑"价值/工期"比最高的 4 个小活组合，半天可完成一组
> **关联 commits**：无前置 commit 依赖
> **整体工期**：约 1.5-2 天

---

## 步骤 1：P - earnings_void 独立 type（2h）

**目的**：admin 给用户调"收益作废"时，流水页"作废"tab 应该能看到这条记录，而不是混在"管理员调整"里。

**业务背景**：
- 业务规则 §7.2 + §8.1：`earnings_void` 是 6 种 balance 调账 type 之一（其他：balance/frozenBalance/recharge/consume_void/earnings_add）
- v2.4 派单存档遗留：之前 `BalanceRecord.type` 写死 `'admin_adjust'`，导致所有调账流水都只能进"管理员调整"tab

**涉及文件**：
- `src/app/api/admin/users/[id]/balance/route.ts`（line 118-129）
- `src/app/dashboard/balance/page.tsx`（line 24-39 TYPE_CONFIG + line 41-50 TYPE_TABS + line 97-103 typeParam）

**修改 1：balance/route.ts 让 BalanceRecord.type 跟随 adjustType**

当前 line 118-129：
```ts
await tx.balanceRecord.create({
  data: {
    userId: id,
    type: 'admin_adjust',          // ❌ 写死了
    amount,
    ...
  },
})
```

改成：
```ts
await tx.balanceRecord.create({
  data: {
    userId: id,
    type: adjustType,              // ✅ 跟随 adjustType（earnings_void / consume_void / etc.）
    amount,
    ...
  },
})
```

**修改 2：balance/page.tsx TYPE_CONFIG 加 earnings_void 一项**

line 24-39 TYPE_CONFIG 加：
```ts
earnings_void: { name: '收益作废', icon: <Undo2 className="w-5 h-5" />, isPositive: false },
```

**修改 3：balance/page.tsx 作废 tab 的 typeParam**

当前 line 102：`activeTab === 'void' ? 'refund_dividend'`

改成（把 earnings_void 也归入作废）：
```ts
activeTab === 'void' ? 'refund_dividend,earnings_void,consume_void'
```

或者更清晰：把"作废"tab 拆成"消费作废"和"收益作废"，看你判断；推荐第一种（合并更简洁）。

**验收**：
- admin 给测试账号做一次"收益作废"调账（如 earnings_void 100）
- 流水页"作废"tab 能看到这条记录，type 显示"收益作废"
- 历史已经做过的 admin_adjust 调账记录不受影响（仍然在"管理员调整"tab）

**派单前 4 步检查（已做）**：
- ✅ grep `BalanceRecord.type` 在 route.ts 出现位置确认
- ✅ grep `TYPE_CONFIG` 在 balance/page.tsx 确认有完整结构
- ✅ grep `earnings_void` 在 order-notification.service.ts 确认 typeLabelMap 已支持
- ✅ 业务冲突：和 v46.11/v52.1 不冲突（v46.11 是余额通知，v52.1 是 rate-limit）

---

## 步骤 2：I - 流水页 description 4 字段标签（2h）

**目的**：流水页 description 当前只显示"订单退款"等大事件，看不到 4 字段（消费余额/可提现/锁定/不可提现）的具体变化。用户查"我这次退款到底动了哪个字段"很难定位。

**业务背景**：
- 业务规则 §三/§四：4 字段余额体系（`consumeBalance/earningsAvailable/earningsPending/earningsVoided`）
- v2.4 派单存档遗留：description 缺 4 字段小字标签
- v46/v53 已经定义了 `format4FieldDelta` 工具函数（line 6 reward.service.ts 引用）

**涉及文件**：
- `src/app/dashboard/balance/page.tsx`（description 渲染处，line 200 附近）
- `src/lib/services/order.service.ts`（BalanceRecord.create 调用处，description 字段拼接）
- `src/lib/services/reward.service.ts`（line 183 已经用 format4FieldDelta，但其他调用可能没接上）

**修改**：

1. **balance/page.tsx description 渲染**：把 description 在 UI 上拆两行显示
   - 大字（第一行）：原 description（如"管理员调账：余额增加 ¥100.00"）
   - 小字（第二行，灰色）：4 字段 delta（如"消费余额 +¥100.00 / 可提现收益 +¥0"）
   - **判断逻辑**：如果 description 里已经有 `(` `)` 包裹的 4 字段内容（说明 service 已经传了），就直接两行显示；否则只显示大字

2. **service 层 description 拼接**：检查所有 BalanceRecord.create 调用，确保 description 末尾拼接 `format4FieldDelta(before, after)`：
   - `order.service.ts` — 退款、调账、订单完成
   - `reward.service.ts:183` ✅ 已经接上
   - `dividend.service.ts` — 分红发放
   - `admin.service.ts` — admin 手动调账（其实就是 step 1 的 balance/route.ts）

**验收**：
- 用户做一次退款 → 流水页能看到"订单退款" + 第二行灰色"消费余额 -¥500.00 / 可提现 +¥50.00"
- 用户收到一次直推奖 → 流水页能看到"直推奖" + "消费余额 +¥0 / 可提现 +¥100.00"
- 截图给胡子哥看（铁律 2：UI 改动必须本地 dev server 截图）

**派单前 4 步检查（已做）**：
- ✅ grep `format4FieldDelta` 找到定义和引用
- ✅ grep `BalanceRecord.create` 找到所有 service 调用点
- ✅ read balance/page.tsx:200 确认 description 渲染位置
- ✅ 业务冲突：和 v46.11/v52.1 不冲突（balance 通知、调账 rate-limit）

---

## 步骤 3：G - 品牌管理奖 v4 细节优化：A 不是经销商时跳过 A（半天）

**目的**：当前代码 A 是会员时品牌管理奖**完全不发**（line 117 直接 return），但业务 v2 §2.2 要求"A 是会员时跳过 A，从安置链上第 1 个经销商开始"。

**业务背景**（业务规则 §2.2 line 164-178）：

```
A 是会员，A 上面是经销商 X
D 买：
- 第 1 单 → A 拿直推 → 跳过 A → 第 1 个经销商 = X → X 拿品牌管理奖
- 第 2 单 → A 拿直推 → 找第 2 个经销商（安置链没有）→ 沉淀
- 第 11 单 → 循环回 X → X 拿
```

**当前代码 bug**：
- `reward.service.ts:117` `if (!referrer || referrer.level < MEMBER_LEVELS.DISTRIBUTOR) return` —— A 是会员时**整段跳过**

**涉及文件**：
- `src/lib/services/reward.service.ts:112-144`（createBrandBonusReward）

**修改**：

line 117 当前：
```ts
if (!referrer || referrer.level < MEMBER_LEVELS.DISTRIBUTOR) return
```

改成（让 findBrandBonusRecipients 处理"跳过会员"逻辑，maxLayers 按 A 计算）：
```ts
if (!referrer) return

// A 不管是不是经销商都要走 findBrandBonusRecipients
// findBrandBonusRecipients 已经实现"会员被跳过但 layer 计数器仍递增"
// maxLayers 按 A 的直推下线经销商数算（computeMaxLayers 自己处理）
const maxLayers = computeMaxLayers(referrer)
if (maxLayers === 0) return  // 只有 maxLayers=0 才不发奖
```

同时 line 122-123 当前按"buyer 自己的付费订单数"算 paidCount，但业务 §2.2 line 174 举例 "D 买第 1 单"，**"D 买"是指 D 的购买次数**，不是 B 的。

让我重新核对一下：从 processOrderRewards 看，`createBrandBonusReward(orderId, orderAmount, buyer.id, buyer.referrerId)` —— buyer 是当前买家。所以 paidCount 是当前买家（B 或 D）的付费订单数。

业务 §2.2 line 156-162 举例 "B 买第 1/2/3/11 单"—— B 的第 N 单 ✅

所以 paidCount = 买家的付费订单数（含当前订单）—— **当前实现是对的**，不要改。

**验收**：
- 写测试用例：构造一个场景——A 是会员，A 上面是经销商 X，B 买普通品
- 验证 X 收到品牌管理奖，A 不收到品牌管理奖（之前是 A 不收，X 也不收 → bug）
- 写测试在 `tests/services/reward.service.test.ts`（参考 v45.7.2.b user.service 测试风格）
- 跑 `pnpm test tests/services/reward.service.test.ts` 0 错误
- typecheck `pnpm typecheck` 0 错误

**派单前 4 步检查（已做）**：
- ✅ grep `findBrandBonusRecipients/computeMaxLayers` 在 reward.service.ts 找到定义
- ✅ read line 8-52 确认 findBrandBonusRecipients 实现正确（会员跳过 layer 仍递增）
- ✅ read processOrderRewards 调用确认 paidCount 是 buyer 的订单数
- ✅ 业务冲突：和 v47 commit `878f1c6` 的实现冲突——需要重写 line 117

---

## 步骤 4：H - 升级品订单计入销售额验证：A 的销售额累加（半天）

**目的**：业务 §3.2 line 311 「升级条件**仅看销售额**」+ §7.4「升级品订单计入销售额」—— 但当前代码 A 的 directSalesAmount 只在 B 买**升级品**时累加，B 买**普通品**时 A 不累加。需要确认业务解读后修复。

**业务背景**（业务规则 §3.2 line 316-320）：

```
| 主任（2→3） | 直推销售额 5 万 |
| 经理（3→4） | 直推销售额 10 万 |
...
```

**解读歧义**：
- 解读 A："直推销售额" = A 推荐的 B/C/D... 累计消费总额（含普通品 + 升级品）
- 解读 B："直推销售额" = A 推荐的 B/C/D... 升级品订单累计金额（只看升级品）

**当前代码**（reward.service.ts:325-360）：
```ts
if (hasUpgradeProduct) {
  // B 买升级品 → A 的 directSalesAmount += order.payAmount
  if (user?.referrerId) {
    await UserService.addDirectSales(user.referrerId, order.payAmount)
  }
}
} else {
  // B 买普通品 → A 的 directSalesAmount 不变
}
```

只有 hasUpgradeProduct 分支会累加 A 的销售额。

**涉及文件**：
- `src/lib/services/reward.service.ts:325-380`（checkUpgradeFromOrder）
- `src/lib/services/user.service.ts:235-244`（addDirectSales）

**修改**：

**方案 A（推荐）**：A 的 directSalesAmount 始终累加 B 的订单金额（无论升级品/普通品）

`reward.service.ts:325-380` checkUpgradeFromOrder 重写：
```ts
// 不管 hasUpgradeProduct，A 的直推销售额都 += order.payAmount
// （业务 §7.4 要求升级品计入销售额；普通品按字面"直推销售额"也应该计入）
await UserService.addDirectSales(userId, order.payAmount)

if (user?.referrerId) {
  await UserService.addDirectSales(user.referrerId, order.payAmount)
}
```

**方案 B（保守）**：只累加升级品订单的金额

保留当前实现，只把升级品的 payAmount 累加。

**判断**：等你（执行 AI）先 grep 业务规则文档 / git log / v52 升级规则 bug 修复 commit `846911b`，看胡子哥当时是怎么定的。如果文档没明确，让胡子哥拍板。

**验收**：
- 写测试：构造一个 B 买普通品订单 → 验证 A 的 directSalesAmount 增加（方案 A）或不变（方案 B）
- 跑 `pnpm test tests/services/user.service.test.ts` 0 错误
- typecheck `pnpm typecheck` 0 错误
- 截图给胡子哥看：A 的 dashboard 显示新的 directSalesAmount 值

**派单前 4 步检查（已做）**：
- ✅ grep `addDirectSales` 在 user.service.ts 找到定义（line 235-244）
- ✅ read processOrderRewards line 325-380 确认 A 的累加逻辑
- ⚠️ **业务解读歧义**：必须让胡子哥拍板"直推销售额"是含普通品还是只看升级品
- ✅ 业务冲突：和 v52 commit `846911b` 升级规则 bug 修复可能冲突——grep v52 commit diff 确认

---

## 整体验收清单

每个步骤都要：

1. **本地验证**：`pnpm dev` 启 dev server → 真实浏览器/Playwright 操作业务链路
2. **截图给胡子哥**（铁律 2）：每个步骤完成后截图，UI 改动必须本地 dev server 真实截图
3. **build 验证**：`pnpm build` 0 错误
4. **测试**：相关测试文件 0 失败
5. **push 验证**：`git push origin main` 之后立刻跑 `git log origin/main --oneline -1` 验证远程 hash（铁律 1）
6. **Vercel 部署验证**：打开 Vercel Dashboard 最新部署 commit hash = 你的 commit hash，Status = Ready
7. **通知给胡子哥**："v60 / 步骤 N 已部署，commit xxx，Vercel Ready。强刷 /dashboard/balance 验证。"

---

## 派单方法论教训（v57.4 强化版，本批沿用）

| 教训 | 来源 |
|------|------|
| 改后端 key/配置必须 grep 前端硬编码 | v57 步骤 1 翻车 |
| 通知类派单必须验证目标环境模板已 seed | v57 步骤 2 翻车 |
| 写 enum-like 字段必须 grep 前端过滤值 | v57 步骤 3 翻车 |
| 派单前 4 步检查：业务 service 真实调用入口 / 枚举值 / read 相关函数 / 业务冲突 | v57 翻车总结 |
| 派单内容必须严格基于需求文档（不要 Mavis 凭空创造） | v55.1 优惠券翻车 |
| 业务解读歧义时必须让胡子哥拍板 | 本批 H 任务 |

---

## v60 派单提示词

````markdown
# v60 / 步骤 1：P - earnings_void 独立 type

## 业务背景
业务规则 §7.2 + §8.1：`earnings_void` 是 6 种 balance 调账 type 之一。当前 `BalanceRecord.type` 写死 `'admin_adjust'`，导致流水页"作废"tab 看不到 `earnings_void` 记录。

## 派单前 4 步检查（已做）
- ✅ grep `BalanceRecord.type` 在 route.ts 出现位置
- ✅ grep `TYPE_CONFIG` 在 balance/page.tsx 确认结构
- ✅ grep `earnings_void` 在 order-notification.service.ts 确认 typeLabelMap 已支持
- ✅ 业务冲突：和 v46.11/v52.1 不冲突

## 涉及文件
- `src/app/api/admin/users/[id]/balance/route.ts`（line 118-129）
- `src/app/dashboard/balance/page.tsx`（line 24-39 TYPE_CONFIG + line 41-50 TYPE_TABS + line 97-103 typeParam）

## 修改 1：balance/route.ts line 121 改成跟随 adjustType
当前：
```ts
type: 'admin_adjust',
```
改成：
```ts
type: adjustType,
```

## 修改 2：balance/page.tsx TYPE_CONFIG 加 earnings_void 一项
在 line 39 后加：
```ts
earnings_void: { name: '收益作废', icon: <Undo2 className="w-5 h-5" />, isPositive: false },
```

## 修改 3：balance/page.tsx line 102 作废 tab typeParam 改成包含 earnings_void
当前：
```ts
activeTab === 'void' ? 'refund_dividend' :
```
改成：
```ts
activeTab === 'void' ? 'refund_dividend,earnings_void,consume_void' :
```

## 验收
- admin 给测试账号做一次 `earnings_void` 调账（如 100）
- 流水页"作废"tab 能看到这条记录，type 显示"收益作废"
- 历史 `admin_adjust` 记录不受影响
- 本地 dev server 截图给胡子哥（铁律 2）
- `pnpm build` 0 错误
- `pnpm typecheck` 0 错误
- `git push origin main` 后跑 `git log origin/main --oneline -1` 验证远程 hash（铁律 1）
- Vercel 部署验证：commit hash 一致 + Status Ready

## 完成后告诉胡子哥
"v60 / 步骤 1 已部署，commit xxx，Vercel Ready。强刷 /dashboard/balance 验证作废 tab。"

# v60 / 步骤 2：I - 流水页 description 4 字段标签

## 业务背景
流水页 description 当前只显示"订单退款"等大事件，看不到 4 字段（消费余额/可提现/锁定/不可提现）的具体变化。v46/v53 已经定义了 `format4FieldDelta` 工具函数。

## 派单前 4 步检查（已做）
- ✅ grep `format4FieldDelta` 找到定义和引用
- ✅ grep `BalanceRecord.create` 找到所有 service 调用点
- ✅ read balance/page.tsx:200 确认 description 渲染位置
- ✅ 业务冲突：和 v46.11/v52.1 不冲突

## 涉及文件
- `src/app/dashboard/balance/page.tsx`（description 渲染处，约 line 200）
- `src/lib/services/order.service.ts`（BalanceRecord.create 调用处）
- `src/lib/services/reward.service.ts`（line 183 已接 format4FieldDelta，其他调用可能漏）
- `src/lib/services/dividend.service.ts`（分红发放处）
- `src/lib/services/admin.service.ts`（admin 手动调账处 = step 1 的 balance/route.ts）

## 修改 1：balance/page.tsx description 渲染拆两行
- 大字（第一行）：原 description
- 小字（第二行，灰色）：4 字段 delta（如果有）

判断逻辑：如果 description 里有 `(` `)` 包裹的 4 字段内容（说明 service 已传），两行显示；否则只显示大字。

## 修改 2：service 层 description 拼接
检查所有 `BalanceRecord.create` 调用，末尾拼接 `format4FieldDelta(before, after)`：
- `reward.service.ts:183` ✅ 已接
- 其他 service 自行 grep 补齐

## 验收
- 用户做一次退款 → 流水页能看到"订单退款" + 第二行灰色"消费余额 -¥500.00 / 可提现 +¥50.00"
- 用户收到直推奖 → 流水页能看到"直推奖" + "消费余额 +¥0 / 可提现 +¥100.00"
- 本地 dev server 截图给胡子哥（铁律 2）
- `pnpm build` 0 错误
- `pnpm typecheck` 0 错误
- `git push origin main` 后跑 `git log origin/main --oneline -1` 验证远程 hash（铁律 1）
- Vercel 部署验证：commit hash 一致 + Status Ready

## 完成后告诉胡子哥
"v60 / 步骤 2 已部署，commit xxx，Vercel Ready。强刷 /dashboard/balance 验证 description 双行显示。"

# v60 / 步骤 3：G - 品牌管理奖 v4 细节优化：A 不是经销商时跳过 A

## 业务背景
业务规则 §2.2 line 164-178：A 是会员时跳过 A，从安置链上第 1 个经销商开始。当前代码 A 是会员时品牌管理奖完全不发（line 117 直接 return），违反业务规则。

## 派单前 4 步检查（已做）
- ✅ grep `findBrandBonusRecipients/computeMaxLayers` 找到定义
- ✅ read line 8-52 确认 findBrandBonusRecipients 实现正确（会员跳过 layer 仍递增）
- ✅ read processOrderRewards 调用确认 paidCount 是买家订单数
- ✅ 业务冲突：和 v47 commit `878f1c6` 冲突——需要重写 line 117

## 涉及文件
- `src/lib/services/reward.service.ts:112-144`（createBrandBonusReward）

## 修改
当前 line 117：
```ts
if (!referrer || referrer.level < MEMBER_LEVELS.DISTRIBUTOR) return
```

改成：
```ts
if (!referrer) return
const maxLayers = computeMaxLayers(referrer)
if (maxLayers === 0) return  // 只有 maxLayers=0 才不发
```

把 line 119-127 的 maxLayers 计算移到 line 117 后。

## 测试
在 `tests/services/reward.service.test.ts` 加测试用例：
- 构造场景：A 是会员，A 上面是经销商 X，B 买普通品
- 验证 X 收到品牌管理奖，A 不收到
- 跑 `pnpm test tests/services/reward.service.test.ts` 0 错误
- `pnpm typecheck` 0 错误

## 验收
- 测试通过
- 本地 dev server 实测：A 是会员的账号，触发品牌管理奖链路，验证第 1 个经销商收到奖
- `pnpm build` 0 错误
- `git push origin main` 后跑 `git log origin/main --oneline -1` 验证远程 hash（铁律 1）
- Vercel 部署验证：commit hash 一致 + Status Ready

## 完成后告诉胡子哥
"v60 / 步骤 3 已部署，commit xxx，Vercel Ready。A 是会员时品牌管理奖修复，测试通过。"

# v60 / 步骤 4：H - 升级品订单计入销售额验证：A 的销售额累加

## 业务背景
业务规则 §3.2 line 311 「升级条件仅看销售额」+ §7.4「升级品订单计入销售额」。

## 业务解读歧义
- 解读 A：「直推销售额」= A 推荐的 B/C/D... 累计消费总额（含普通品 + 升级品）
- 解读 B：「直推销售额」= A 推荐的 B/C/D... 升级品订单累计金额（只看升级品）

## 当前代码
`reward.service.ts:325-380` checkUpgradeFromOrder：只有 `hasUpgradeProduct` 分支会累加 A 的 directSalesAmount。

## ⚠️ 必须先让胡子哥拍板
执行前必须 grep：
1. `git log -p 846911b` 看 v52 commit 升级规则 bug 修复当时怎么定的
2. `docs/业务规则需求文档.md` line 316-320 看"直推销售额"的定义
3. 文档没明确 → 让胡子哥拍板（在派单群里问"直推销售额含普通品吗"）

## 派单前 4 步检查（已做）
- ✅ grep `addDirectSales` 找到定义
- ✅ read checkUpgradeFromOrder 确认 A 的累加逻辑
- ⚠️ 业务解读歧义——必须让胡子哥拍板
- ✅ 业务冲突：和 v52 commit `846911b` 可能冲突——grep diff 确认

## 涉及文件
- `src/lib/services/reward.service.ts:325-380`（checkUpgradeFromOrder）
- `src/lib/services/user.service.ts:235-244`（addDirectSales）

## 修改（按胡子哥拍板方案执行）
**方案 A（推荐）**：A 的 directSalesAmount 始终累加 B 的订单金额（无论升级品/普通品）
**方案 B（保守）**：只累加升级品订单的金额

## 测试
在 `tests/services/user.service.test.ts` 加测试：
- 构造 B 买普通品订单 → 验证 A 的 directSalesAmount 变化（按方案 A 应该是增加）
- 跑 `pnpm test tests/services/user.service.test.ts` 0 错误
- `pnpm typecheck` 0 错误

## 验收
- 测试通过
- 本地 dev server 实测：A 的 dashboard 显示新的 directSalesAmount 值
- 截图给胡子哥看
- `pnpm build` 0 错误
- `git push origin main` 后跑 `git log origin/main --oneline -1` 验证远程 hash（铁律 1）
- Vercel 部署验证：commit hash 一致 + Status Ready

## 完成后告诉胡子哥
"v60 / 步骤 4 已部署，commit xxx，Vercel Ready。H 任务按方案 A/B 完成，dashboard 显示新的 directSalesAmount。"
````

---

## 派单存档元数据

- **派单类型**：4 个业务小活组合
- **总工期**：约 1.5-2 天
- **依赖关系**：步骤 1-2 独立可并行；步骤 3-4 涉及业务规则，建议先做 3 再做 4（因为 H 任务依赖业务解读，让 G 先通过胡子哥验证业务规则流程）
- **风险**：步骤 3 涉及业务规则改动 + 测试新增；步骤 4 业务解读歧义需要胡子哥拍板