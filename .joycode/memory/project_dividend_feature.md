---
name: dividend-feature
description: 分红奖功能实现和升级逻辑修复
type: project
---

## 分红奖功能

- 分红结算 API: `src/app/api/admin/settle-dividends/route.ts` (POST)
- 分红查询 API: `src/app/api/dividends/route.ts` (GET)
- 每日任务脚本: `scripts/daily-tasks.js`
- 自动化测试: `test_dividend_auto.js`

### 分红分配算法（累加式）
- 分红池 = 当日所有已支付订单总额 * 5%
- 参与条件: 等级 >= 3（主任）
- 主任每人分红 = 分红池 / (所有参与人数)
- 经理每人分红 = 主任分红 + 分红池 / (经理及以上人数)
- 总监每人分红 = 经理分红 + 分红池 / (总监及以上人数)
- 以此类推（高级别叠加低级别份额）

### 关键修复
- **升级逻辑**: 用户等级检查不再限制在"经销商及以上"才能检查主任升级，低等级用户满足直推条件也可直接升级
- **直推经销商计数**: 升级跨越经销商等级时也正确增加推荐人的 directDistributorCount
- **Dividends API 认证**: 从不存在的 `getUserFromToken` 改为 `verifyToken`

### Why: 用户A作为会员(1)有3个直推经销商但无法升级为主任(3)
### How to apply: 升级检查应遍历所有等级条件，不受当前等级限制