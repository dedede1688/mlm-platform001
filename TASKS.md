# mlm-platform 任务列表

> 最后更新：2026-07-21 | 版本：v62 | 状态：验收中

---

## 一、已完成（6 项）

| # | 内容 | 版本 | 状态 |
|---|---|---|---|
| T01 | settleDividends 死代码清理 | v51 | ✅ |
| T02 | 分红周结：设计方案 | v51 | ✅ |
| T03 | 用户侧鉴权加固 | v52 | ✅ |
| T04 | Dividend 加结算标记 + migration | v51 | ✅ |
| T05 | 每日快照 / 每周发放拆分 | v51 | ✅ |
| T06 | TDD 测试 + typecheck + build 验证 | v51 | ✅ |

---

## 二、代码修复（4 项）— 执行者：外部小猫

| # | 等级 | 内容 | 批次 | 状态 |
|---|---|---|---|---|
| T07 | **P1+A3** | 支付 Modal 关闭/时序修复 | 批次 1 | 📝 |
| T08 | A1 | 支付奖励失败补偿机制 | 批次 2 | 📝 |
| T09 | A2 | 分红页错误处理 + 重试 | 批次 2 | 📝 |
| T10 | A4 | MetricCard 无障碍属性 | 批次 2 | 📝 |

**T07 涉及文件**：
- `src/app/dashboard/orders/[id]/page.tsx` — handlePayConfirm 加 setPayModalOpen(false)
- `src/app/dashboard/orders/page.tsx` — handlePayConfirm 中 setPayModalOpen 调序

**T08 涉及文件**：
- `src/app/api/orders/[id]/verify-payment/route.ts` — catch 块加补偿日志/队列

**T09 涉及文件**：
- `src/app/admin/dividends/page.tsx` — fetchSummary 区分"加载失败"/"暂无数据"

**T10 涉及文件**：
- `src/app/admin/dashboard/page.tsx` — MetricCard 加 role/tabIndex/onKeyDown

---

## 三、优化（4 项）— 执行者：外部小猫

| # | 内容 | 批次 | 状态 |
|---|---|---|---|
| T11 | 支付 Modal 统一 hook（usePaymentModal） | 批次 3 | 📝 |
| T12 | PaymentPasswordModal 加 error prop | 批次 3 | 📝 |
| T13 | 分红页 token 过期友好提示 | 批次 3 | 📝 |
| T14 | 类型强化（interface 抽取 + unknown 守卫） | 批次 3 | 📝 |

---

## 四、验收（2 项）— 操作者：胡子老师

| # | 内容 | 操作 | 状态 |
|---|---|---|---|
| T15 | 分红周结 | 日快照 → 周结 → 重复周结（幂等） | 📝 |
| T16 | Admin 后台各页面 | 过一遍所有页面（商品/订单/会员/财务/系统/通知/日志） | 📝 |

---

## 五、历史已交付版本（v51-v62）

| 版本 | 日期 | 内容 |
|---|---|---|
| v51 | 07-20 | 分红周结改造（迁移+快照+发放+去重） |
| v52 | 07-20 | 鉴权加固 |
| v53 | 07-20 | console.log 收敛 + PRD 同步 |
| v54 | 07-20 | 团队树可视化 |
| v55 | 07-21 | 团队树"自己"标识修复 |
| v55b | 07-21 | 团队树点击高亮修复 |
| v56 | 07-21 | 升级品品牌奖修复 + PRD 对齐 |
| v57 | 07-21 | 支付 toast 误报修复 |
| v58 | 07-21 | 支付密码 Modal 替代 prompt |
| v59 | 07-21 | 订单已发货红点提醒 |
| v60 | 07-21 | admin 数据中台卡片跳转 |
| v61 | 07-21 | admin 分红结算页面 |
| v62 | 07-21 | 分红页字段对齐 API |

---

## 六、三角色分工（铁流程）

```
胡子老师（拍板+中转） ←→ 小酷（设计+审核）
         ↕
    外部小M（代码审查）
    外部小猫（执行+测试）
```

规则：
- 一次只派一个角色
- 完成一个 → 审核 → OK 再下一个
- 小酷写提示词 → 胡子老师复制发给外部
