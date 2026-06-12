---
name: dividend-feature
description: 分红奖功能实现和升级逻辑修复
type: project
---

## 分红模块完善（已完成）

### 奖励比例体系
- 直推奖（referral）：10%（从20%改为10%）
- 团队奖（team）：3级递减 —— 第1级5%、第2级3%、第2级2%
- 品牌管理奖（brand_bonus）：20%（不变）
- 分红奖（dividend）：5%分红池，按等级权重分配

### 团队奖逻辑
- 从购买者的推荐人开始，向上遍历最多3级
- 每级推荐人必须是经销商（level>=2）及以上才可获得
- 不符合条件的级跳过，继续向上
- Set<string> 防止循环依赖

### 分红奖逻辑
- 从购买者向上遍历推荐链，找所有总监（level>=5）及以上的上级
- 5%订单金额作为分红池
- 按等级权重分配：总监=1、总裁=2、董事=3
- 使用 Dividend 模型记录（含 userLevel/totalPool）
- loopGuard 上限50防止意外无限循环

### 关键文件
- `src/lib/constants.ts` — REWARD_RATES + TEAM_REWARD_LEVELS
- `src/lib/services/reward.service.ts` — 核心计算服务
- `src/app/api/admin/rewards/route.ts` — 管理API（含汇总统计）
- `src/app/admin/finance/page.tsx` — 后台财务管理（统计卡片+团队奖筛选）
- `src/app/dashboard/rewards/page.tsx` — 前台奖励页面（团队奖tab+展示）

### 技术要点
- 所有奖励发放使用 prisma.$transaction 保证一致性
- processRefund 同时扣回 Reward 和 Dividend
- getUserRewardStats 返回 teamTotal 新增字段