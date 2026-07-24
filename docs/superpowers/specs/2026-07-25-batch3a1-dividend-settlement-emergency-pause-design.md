# Batch 3A-1 分红结算紧急暂停设计

> 负责人：小酷（Codex）
> 分级：P 级（资金）
> 状态：胡子老师已批准设计方向，待规格复核后编写执行计划
> 日期：2026-07-25

## 1. 背景与审计结论

Batch 3A 只读审计确认，订单奖励链路与周结链路会处理同一批分红：

- `RewardService.createDividendReward()` 创建 `settled=false` 的分红明细，同时立即增加用户 `earningsAvailable`；
- `DividendService.settleWeeklyDividends()` 查询全部 `settled=false` 明细，并再次增加用户 `earningsAvailable`；
- 自动周结由 Vercel Cron 在每周日 16:00 UTC，即北京时间周一 00:00 触发；
- 超级管理员和财务管理员还可以通过后台接口手动触发周结。

生产库只读聚合对账确认：

- 当前有 2 条未结算分红；
- 涉及 2 个用户和 1 个已支付订单；
- 分红合计 ¥50；
- 两条分红均能匹配同用户、同金额、前后 10 秒内的即时入账流水；
- 当前尚无对应周结流水和周结奖励记录，因此第二次入账尚未发生。

## 2. 目标

在完整修复分红状态机之前，立即阻止所有周结入账入口，确保当前 ¥50 及暂停期间新增的未结算明细不会被再次计入用户可提现收益。

本批次只做紧急止血，不重构分红算法，不处理历史资金，不改变订单支付及其他奖励。

## 3. 已批准方案

采用“三层暂停”方案：

1. 服务层总闸：`settleWeeklyDividends()` 在任何数据库写操作之前返回明确的暂停结果。
2. 自动任务层：每周任务识别暂停结果，记录警告并返回明确状态，不把暂停误报为已结算。
3. 后台接口层：管理员手动请求 `action=settle` 时返回 HTTP 503 和固定中文提示“分红结算维护中，当前未执行任何资金操作”。

服务层是最终保护边界。即使出现未知调用入口，也不能绕过暂停执行资金写入。

## 4. 范围

### 4.1 允许修改

- `src/lib/services/dividend.service.ts`
- `src/lib/utils/cron.ts`
- `src/app/api/admin/settle-dividends/route.ts`
- `__tests__/services/dividend.test.ts`
- 与每周任务或后台结算路由直接对应的测试文件；如当前不存在，允许新增最小测试文件

### 4.2 明确不修改

- `vercel.json`：保留 Cron 配置，使系统持续产生可观察的暂停记录，完整修复后无需重新恢复调度配置；
- `RewardService.createDividendReward()`：本批次不改变订单即时分红行为；
- Prisma schema 与 migration；
- 生产数据库中的 `dividends`、`rewards`、`balance_records` 和用户资金字段；
- 退款、提现、直推奖、品牌管理奖及订单支付逻辑；
- 当前 2 条、合计 ¥50 的未结算分红状态。

## 5. 服务层设计

`settleWeeklyDividends()` 必须在进入 Prisma 事务、读取未结算数据或执行任何写操作之前返回：

```ts
{
  paused: true,
  batchId: null,
  totalAmount: 0,
  totalDividends: 0,
  distributedUsers: 0,
  details: [],
  message: '分红结算维护中，当前未执行任何资金操作'
}
```

暂停逻辑使用名称明确的模块级常量，并附带 Batch 3A-1 注释。不得依赖环境变量，因为环境变量遗漏、预览环境差异或错误配置可能意外开启结算。

暂停期间不得调用：

- `prisma.$transaction`
- `user.update` 或 `user.updateMany`
- `balanceRecord.create` 或 `balanceRecord.createMany`
- `reward.create` 或 `reward.createMany`
- `dividend.update` 或 `dividend.updateMany`

## 6. 自动任务设计

`runWeeklyTasks()` 调用服务后检查 `paused`：

- `paused=true` 时记录 `logger.warn`；
- 返回 `dividendSettle: { success: false, paused: true, data }`；
- 不抛出异常，不触发重试型重复调用；
- Cron HTTP 路由可以正常结束，但响应内容必须明确显示结算没有执行。

日志不得包含用户标识、订单编号、资金明细或密钥，只记录 Batch 编号和暂停原因。

## 7. 后台接口设计

`POST /api/admin/settle-dividends` 保留现有权限校验。

- `action=snapshot` 保持现状，本批次不改变；
- `action=settle` 不调用资金写入，返回 HTTP 503；
- 响应体为：

```json
{
  "success": false,
  "paused": true,
  "error": "分红结算维护中，当前未执行任何资金操作"
}
```

不得返回 HTTP 200 或 `success: true`，避免管理员误认为结算成功。

## 8. 数据安全与恢复

- 本批次不执行生产数据库 UPDATE、INSERT、DELETE 或 DDL；
- 当前已即时到账的 ¥50 保持不动；
- 当前 `settled=false` 明细继续保留，供 Batch 3A-2 对账和迁移；
- 暂停期间新增明细允许继续积累，但不得周结入账；
- 完整修复不得只删除暂停常量，必须先完成统一资金状态机、历史对账和退款链路测试。

## 9. 测试与验收

### 9.1 自动化测试

必须先写失败测试，再实现暂停：

1. 调用 `settleWeeklyDividends()` 返回 `paused=true`；
2. 暂停结果的金额和数量均为 0；
3. `prisma.$transaction` 未调用；
4. 所有用户、流水、奖励和分红写方法均未调用；
5. 每周任务把暂停报告为 `success=false, paused=true`；
6. 后台 `action=settle` 返回 HTTP 503、`success=false`、`paused=true`；
7. 后台 `action=snapshot` 行为不回归；
8. 未授权用户仍按原权限逻辑拒绝访问。

### 9.2 本地验证

- 相关测试全部通过；
- 全量测试通过；
- TypeScript typecheck 0 错误；
- Next.js build 成功；
- `git diff` 只包含批准范围内文件。

### 9.3 独立复审与发布

1. 小酷完成设计与执行计划；
2. 小猫按完整提示词执行 TDD 和实现；
3. 小酷核对差异与验证证据；
4. 小M进行 P 级独立只读复审；
5. 胡子老师批准提交和发布；
6. 精确暂存批准文件，禁止 `git add .` 和 `git add -A`；
7. 推送后核对本地 HEAD、`origin/main` 与 Vercel 部署 commit；
8. Vercel 必须为 Production Ready；
9. 线上只验证暂停响应，不手动执行任何真实资金结算。

## 10. 完成标准

以下条件全部满足才可判定 Batch 3A-1 完成：

- 自动周结不能修改任何资金或结算数据；
- 后台手动周结不能修改任何资金或结算数据；
- 调用方能明确识别“暂停”，不存在成功假象；
- 当前 ¥50 未被再次入账；
- 生产数据库未被本批次主动修改；
- 测试、typecheck、build 全绿；
- 小M复审通过；
- 胡子老师完成发布与线上验收。

## 11. 后续批次

Batch 3A-2 必须统一设计以下内容：

- 分红唯一生成口径；
- 周结原子领取与并发幂等；
- 唯一约束或结算批次约束；
- `Dividend`、`Reward`、`BalanceRecord` 的单一事实来源；
- 退款扣回规则；
- 暂停期间未结算明细及当前 ¥50 的迁移策略；
- 生产对账、差额处理和可回滚方案。
