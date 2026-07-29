# 项目全面盘点报告（2026-07-29）

> **用途**：项目状态快照 + 任务清单 + 优先级排序 + 工作计划
> **作者**：小酷（mavis Session A）
> **方法**：代码 grep + next lint + pnpm audit + 文档审阅
> **状态**：本文档为 v72 决策包配套报告

---

## 一、项目规模快照（实测）

| 维度 | 数量 |
|------|------|
| `src/` 文件总数 | **302** |
| 顶层模块目录 | **~50** |
| 业务 service（`src/lib/services/`） | **30** |
| 工具函数（`src/lib/utils/`） | **20** |
| 后台页面（`src/app/admin/**/page.tsx`） | **21+** |
| 后台组件（`src/app/admin/**/_components/*.tsx`） | **18** |
| API 路由（`src/app/api/**/route.ts`） | **59+** |
| `prisma/schema.prisma` | **566 行** |
| `next lint` 报错 | **284 errors + 53 warnings = 337** |
| `$queryRaw / $queryRawUnsafe` 残留 | **0** ✅（铁律 5 实施成功） |
| `any` 类型 | **21 处 across 12 文件** |

---

## 二、🔴 P0 - 立刻修（安全漏洞，3 项）

### P0-1：XSS 漏洞 - `product.description` 未 sanitize

- **位置**：`src/app/products/[id]/page.tsx:1053`
- **代码**：
  ```tsx
  <div dangerouslySetInnerHTML={{ __html: product.description || '' }} />
  ```
- **风险**：管理员后台富文本编辑器填的 `product.description` 直接渲染到用户端，**未经过 sanitize-html**
- **攻击路径**：恶意管理员 / 被破解的 admin 账号 → 提交 `<script>alert(document.cookie)</script>` → 用户访问产品页 → XSS 执行
- **同类风险**（同一文件）：
  - `:1065` `product.research` 同样的问题
  - `app/terms/page.tsx:96` `termsHtml`
  - `app/privacy/page.tsx:119` `privacyHtml`
- **修复方向**：调用 `sanitizeHtml(html, ...)` 包一层
- **工时**：30 分钟

### P0-2：npm 漏洞 - `xlsx@0.18.5` 高危

- **漏洞 ID**：GHSA-4r6h-8v6p-xvw6（Prototype Pollution）+ GHSA-5pgg-2g8v-p4x9（ReDoS）
- **当前版本**：0.18.5
- **修复版本**：>=0.20.2
- **影响**：上传恶意 xlsx 文件可触发漏洞
- **修复方向**：`pnpm update xlsx@^0.20.2` + 跑 build + 跑相关测试
- **工时**：10 分钟（含测试）

### P0-3：npm 漏洞 - `postcss@8.4.31` 中危

- **漏洞 ID**：GHSA-qx2v-qp2m-jg93（XSS via `</style>` in CSS Stringify）
- **当前版本**：8.4.31（transitive via `next` / `next-intl`）
- **修复版本**：>=8.5.10
- **修复方向**：升级 Next.js / next-intl 拉到 postcss 8.5.10+ 的版本
- **工时**：15 分钟（含测试）

---

## 三、🟡 P1 - 本周内（代码质量 + 待排期问题）

### P1-1：next lint 337 个问题

- **主要问题**：未用 import（200+ 估计）
  - `src/app/admin/categories/page.tsx`：6 个未用图标
  - `src/app/admin/finance/page.tsx`：20+ 个未用图标/常量
  - `src/app/admin/notifications/page.tsx`：X 图标未用
  - 其他页面类似
- **次要问题**：
  - `react-hooks/exhaustive-deps` 缺依赖（useEffect）
  - `@next/next/no-img-element`（用 img 而非 next/image）
  - `@typescript-eslint/no-explicit-any`（21 处）
- **修复策略**：
  - 批量删未用 import（30 分钟机械操作）
  - useEffect 缺依赖逐个修（按需 1-2 小时）
  - `any` 类型按需替换（铁律 10 已部分实施）
- **工时**：2-3 小时

### P1-2：待排期问题（来自 docs/派单历史/待排期问题清单.md）

> **注**：原清单"待排期-2/3" 在"已修复"表格里有 commit 记录（`87c07b2` / `d0ede1b`），但**没从"待排期"段删掉**——文档不一致，建议清理。

| 编号 | 问题 | 严重度 | 现状 | 工时 |
|------|------|--------|------|------|
| 待排期-1 | 每日解锁功能不生效（v55.1 修复前的历史 schedule 补建） | 🔴 P0 | 仍有 3 个历史 `orderId=''` active schedule，totalPoints 7019，remainingPoints 6163，**需胡子老师决策派单** | 2-4 小时 |
| 待排期-2 | admin 调积分不写 pointsRecord 明细 | 🟡 P1 | **v57.2 B 已修（87c07b2）**—— 文档应从待排期段删除 | 5 分钟（清理）|
| 待排期-3 | 前端硬编码 FEE_PERCENT=10 | 🟡 P1 | **v57 步骤 1 已修（d0ede1b + 76c0658）**—— 文档应从待排期段删除 | 5 分钟（清理）|
| 历史-2 | lookup API 隐私问题（任何登录用户能查手机号） | 🟢 P2 | 等胡子老师决策 | — |
| 历史-3 | lookup API 限流缺失 | 🟢 P2 | 暂不处理 | — |

### P1-3：v72 决策包（v72 是今天 v71 之后的下一个版本号）

- 评分表新增 IDENTITY-TEST-002 行（**已做**）
- docs/delegation/ 3 份试跑存档（**已存在**）
- AGENTS.md 写 v72 变更日志（**待做**）
- 工作区 commit + push（**待做**）
- **工时**：30 分钟

---

## 四、🟢 P2 - 下一轮迭代（小M 试跑发现 + 长期规划）

### P2-1：README.md 修复（test-review-002 发现）

| 编号 | 问题 | 修复方向 |
|------|------|----------|
| P0-1 | 路径混用（README 旧路径 vs AGENTS.md v71 新路径） | 统一 onboarding 路径，旧版标 legacy |
| P0-2 | Step 4 缺评分环节 | 加 `identity-test-rubric.md` 引用 |
| P1-1 | 角色映射表字段不一致 | 加"核心职责"列 |
| P1-2 | 协作链图自相矛盾 | 改"胡子老师中转"为"先经小酷审核" |
| P1-3 | 协作链图编号混乱 | 重新排序号 |
| P2-1 | 三态结论重复 | 明确"小M 三态 vs 小酷流程验收"分工 |
| P2-2 | 4 阶段 vs 派单协议层级 | 加"任务级"标注 |

### P2-2：服务间依赖梳理

**核心 6 个 service**（按被调用次数排序）：

| Service | 被调用次数 | 核心地位 |
|---------|-----------|----------|
| `OrderLifecycleService` | 11+ | 订单生命周期（最强耦合点） |
| `UserService` | 11+ | 用户中心 |
| `OrderNotificationService` | 6+ | 订单通知（被多个 service 依赖） |
| `NotificationService` | 6+ | 通知中心 |
| `RechargeService` | 6+ | 充值 |
| `ProductService` | 5+ | 商品 |

**改进建议**：
- `OrderLifecycleService` 拆分（订单状态机 / 订单通知 / 订单奖励 三个独立 service）
- `UserService` 拆分（用户基础 / 用户积分 / 用户资金 / 推荐关系 四个独立 service）

### P2-3：38 份历史派单存档整理

- 现状：`docs/派单历史/` 有 38 份历史派单存档（v0.0 ~ v3.3）
- 改进：建 `docs/派单历史/README.md` 索引页 + 按时间/类型/任务分类

### P2-4：业务规则 v2 升级

- 现状：`docs/business-rules-v2-spec.md` 存在（glob 看到）
- 状态：未确认是否已实施

---

## 五、立即可执行计划（P0 三件套，~1.5 小时）

按工时 + 风险排序：

1. **升级 xlsx + postcss**（25 分钟）—— P0-2 + P0-3 合并做
   ```bash
   pnpm update xlsx@^0.20.2
   # postcss 升级需要更新 next/next-intl 版本
   pnpm update next@latest next-intl@latest
   pnpm build && pnpm test
   ```

2. **修复 XSS 漏洞**（30 分钟）—— P0-1
   - `src/app/products/[id]/page.tsx:1053, 1065` 加 `sanitizeHtml(...)`
   - `src/app/terms/page.tsx:96` 加 `sanitizeHtml(...)`
   - `src/app/privacy/page.tsx:119` 加 `sanitizeHtml(...)`

3. **批量删未用 import**（30 分钟）—— P1-1 部分
   - 200+ 处未用 import 一次性清掉
   - 跑 `next lint` 验证

4. **v72 决策包**（30 分钟）—— P1-3
   - 写 AGENTS.md v72 变更日志
   - commit + push
   - 验证 `git log origin/main --oneline -1`（铁律 1）

---

## 六、决策点（需胡子老师拍板，3 选 1）

胡子老师，**P0 三件套是关键风险**，按 ~1.5 小时工时算：

- **A. 立刻开干 P0 三件套**（建议）—— 1.5 小时，今天内交付
- **B. 立刻开干 P0 + P1-3 v72 决策包** —— 2 小时，覆盖安全 + 决策留痕
- **C. 重设范围** —— 你从 P0/P1 里挑最关心的 1-2 件，我只做那部分

**A / B / C？** 选一个我立刻干。
