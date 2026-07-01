# Project Memory — MLM Platform (`D:\mlm-platform-source\mlm-platform`)

This file is the project's source of truth for conventions, gotchas, and rules that
apply only to this repo. Anything cross-project belongs in
`~/.mavis/agents/mavis/memory/MEMORY.md` instead.

---

## 🔒 两条铁律（v6/v7 实战总结，2026-06-14 写入）

### 铁律 1：commit + push 成功 ≠ 部署完成

`git push` 可能**静默失败**（终端显示 commit 消息但 push 实际未完成），
**Vercel Dashboard 不会自动报错**。

**强制流程**：

1. `git push origin main` 之后
2. **必须** 立刻跑：`git log origin/main --oneline -1`
3. 对比 Vercel Dashboard 最新部署的 commit hash
4. **不一致 = push 失败**，需要重新 push

**v6 真实事故**：
- 本地 commit `3f53bc4` 存在
- 终端显示 `git push` 成功
- `git log origin/main` 实际还停在 `d9a94d3`（v6 旧版）
- Vercel 部署的是 v6 旧版，胡子哥看到页面没变化
- 排查 30 分钟才发现 → 重推 `3f53bc4` → Vercel 重新部署

**v7 修复**：
- 猫爪主动跑了 `git log origin/main --oneline -1` 验证
- 确认 `bed3802` 在远程 → 部署成功
- 流程闭环

---

### 铁律 2：UI 改动必须本地 dev server 真实截图

**不能**只信 "build 通过 + push 成功"。

**强制流程**：

1. 改完代码后，**必须** `pnpm dev` / `npm run dev` 启 dev server
2. **必须** 真实浏览器（或 Playwright + Chromium）打开目标页面
3. **必须** 登录后台 → 访问受保护页面（`/admin/*`）→ **截图**
4. 截图给胡子哥看 → 通过后 → build + push

**真实约束（不是借口）**：
- Playwright **headless 模式** + `/admin/*` **登录拦截** 是真实技术限制
- Headless 模式无法绕过登录认证，截图会落在 login 页面
- **这种情况** 接受 "源码级验证 + 胡子哥登录后截图" 替代方案
- **不接受** "build 成功" 就当作 "页面已经变了"

**v6 真实事故**：
- 猫爪改完代码说"build 成功 + 推送成功"
- 实际部署的是 v6 旧版（commit `d9a94d3`，缺 flex-wrap 和 stripHtmlTags）
- 胡子哥看到页面没变化 → 排查才发现是部署的代码不完整

**v7 修复**：
- 猫爪在本地 dev server 启起来了
- Playwright 截图被 login 拦截，**主动承认限制**
- **改用源码级验证**（cat file 确认代码改动都在） + **胡子哥登录后截图**

---

### 铁律 4：$queryRaw 错误链必须一次修到底（v12 实战总结，2026-06-15 写入）

**核心教训**：`$queryRaw` / `$queryRawUnsafe` 的错误是**链式暴露**的——
每修好一层，build 才会暴露下一层。**不能只修表面错误就推送**。

**注册 500 错误的真实迭代链**（5 轮）：

| 轮次 | 错误信息 | 根因 | 修复 |
|------|---------|------|------|
| 第 1 轮 | `relation "User" does not exist` | Prisma 模型名 ≠ 数据库表名 | `"User"` → `"users"` |
| 第 2 轮 | `column "parentId" does not exist` | camelCase 字段名 ≠ snake_case 列名 | `parentId` → `parent_id` 等 |
| 第 3 轮 | **`text = uuid HINT`** | `${var}::uuid` 模板字面量类型不匹配 | 改用 `$queryRawUnsafe` + `'${id}'::uuid` 手动拼接 |
| 第 4 轮 | `sql` 导入不存在 / TS 类型报错 | Prisma 6 的 `sql` 模板标签 TS 定义缺失 | 移除 `sql` 标签，统一 `$queryRawUnsafe` |
| 第 5 轮 | 连锁类型错误（`points`/`balance`/`grantPoints`/`dailyUnlock`） | Prisma schema 字段名与代码不一致 | 全部对齐 schema（`totalPoints` 替代 `points`，补全必填字段等） |

**强制规则**：

1. **每次 `$queryRaw` 相关修复后，必须跑 build 直到 0 错误**
2. **如果 build 报错和 SQL/Prisma 类型相关，说明还有下一层问题**
3. **涉及 service 文件时，必须检查所有调用方的方法签名是否匹配**
4. **字段名必须以 `prisma/schema.prisma` 为准，不能用直觉猜**

**v12 真实事故**：
- 修完第 1 轮（表名）就 push → 部署后还是 500
- 修完第 2 轮（列名）就 push → 还是 500
- 修完第 3 轮（uuid 类型）就 push → build 直接失败（TS 类型）
- 前后共 5 轮迭代、2 小时才彻底解决

---

## 📁 项目关键信息

- **路径**：`D:\mlm-platform-source\mlm-platform`（**不是** `D:\mlm-platform-A`）
- **部署**：Vercel，自动从 `main` 分支部署
- **Vercel Dashboard**：https://vercel.com/dashboard → `mlm-platform001`
- **数据库**：Supabase（service role key 在 `@/lib/supabase/server`）
- **后端**：Next.js App Router + Prisma
- **前端 UI**：Tailwind CSS + lucide-react 图标

---

## 🛠️ 项目级规则（v5 实战总结）

### 1. 富文本 description 字段的展示规则

`product.description` 是 HTML 富文本（带 `<img>`、`<p>` 等标签）。

- ❌ **不能** 在列表页直接 `{product.description}` 当纯文本渲染
- ✅ **必须** 用 `stripHtmlTags()` 函数去标签 + 截取前 50 字
- ✅ **必须** IIFE 或 map 外面算一次，**不要** 在同一行调用多次
- ✅ 列表只显示摘要；编辑弹窗用 `RichTextEditor` 完整编辑
- ✅ title 属性 = 完整纯文本（鼠标悬停看）

**v6 真实事故**：
- 列表页直接 `{product.description}` → 漏出 `<img src="https://yozsxdnilcbwrmhqg...">` 整行
- 修复：`stripHtmlTags` + IIFE 包裹 + 50 字截断

### 2. 商品复制时的 status 兜底

数据库 status 字段严格枚举（`active` / `inactive`），前端提交时**必须**：

```typescript
formData.status === 'active' ? 'active' : 'inactive'
```

**不能** 直接 `formData.status` 透传——前端可能传 `undefined` / `null` / 其他字符串。

### 3. 鉴权重用现有工具

```typescript
import { verifyPermission } from '@/lib/utils/admin-auth'

const { authorized, user } = await verifyPermission(request, ['goods_admin', 'super_admin'])
```

**不要** 自己写鉴权逻辑——直接用 `verifyPermission`。

### 4. 操作日志风格

```typescript
import { logOperation } from '@/lib/utils/operation-log'

await logOperation({
  userId: user.id,
  action: 'CREATE',  // CREATE / UPDATE / DELETE
  module: 'product',
  targetId: product.id,
})
```

**注意**：`logOperation` 接受**对象参数**，**不是**位置参数。

### 5. lucide-react 图标陷阱

- ❌ `Copy` 图标**不存在**（Vercel build 报错：`Cannot find name 'Copy'`）
- ✅ 用 `ClipboardCopy` 代替
- 同理 `ToggleLeft` / `ToggleRight` 存在

### 6. Prisma `Json` 字段的只读性

`Json` 字段从数据库返回后是只读对象，**不能**直接赋值给其他对象。

```typescript
// ✅ 正确
const cleanData = JSON.parse(JSON.stringify(product.gallery))

// ❌ 错误
const cleanData = product.gallery  // 后续修改会报错
```

### 7. 操作列按钮排版规范（v7 确定）

```tsx
<td className="px-4 py-3 text-right min-w-[300px]">
  <div className="flex flex-wrap items-center justify-end gap-1.5 pl-3 whitespace-nowrap">
    <button className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg
                       transition-colors font-medium min-h-[28px] ...">
      <Icon className="w-3.5 h-3.5" />
      文字
    </button>
    ...
  </div>
</td>
```

**关键**：
- `min-w-[300px]` —— 操作列最小宽度
- `whitespace-nowrap` —— 按钮内文字禁止换行
- `pl-3` —— 与状态列视觉间距
- `min-h-[28px]` —— 所有按钮统一高度
- `text-xs` + `py-1` —— 紧凑但不挤

---

## 🚀 部署流程（v6/v7 实战总结）

```bash
# 1. 改代码
# 2. 本地验证
pnpm dev  # 必须启 dev server 截图给胡子哥看

# 3. build 验证
pnpm build  # 必须 0 错误

# 4. 提交推送
git add .
git commit -m "type: subject"
git push origin main

# 5. ⚠️ 关键：验证远程 commit（铁律 1）
git log origin/main --oneline -1
# 必须显示你刚 push 的 commit hash

# 6. 验证 Vercel 部署
# 打开 https://vercel.com/dashboard → mlm-platform001 → Deployments
# 最新部署的 commit hash 必须 = 你的 commit hash
# Status 必须是 Ready（绿点）

# 7. 通知胡子哥
"v7 已部署，commit bed3802，Vercel Ready。强刷 /admin/products 验证。"
```


### 铁律 11：派单前 grep 业务 service 方法的所有真实调用入口（v46.10.3 实战总结，2026-06-26 写入）

**核心教训**：service 方法可能在文件里写得"很完美"，但**调用入口根本没调它**。这是 3 次实战连续踩的坑（v46.7 IIFE、v46.10.3 payOrder、v46.11 admin 调账、v46.12 refund review/complete）。

**v46.10.3 真实事故**：
- `OrderService.payOrder()` 里写了 `await (async()=>{...})()` 触发通知
- 但 `/api/orders/[id]/verify-payment` 是真实支付入口，**完全没调 payOrder**，inline 自己的事务
- 结果：订单支付成功 → 通知没生成 → 用户端铃铛不增加 → 100% 通知失效

**强制规则**：

1. **派单前 grep 所有 service 方法的真实调用入口**：
```bash
rg -n "OrderService\.payOrder|OrderService\.shipOrder|OrderService\.requestRefund" src/
# 0 行调用 = 死代码
# < 3 行 = 高风险（只有少数入口调）
```

2. **重构时检查所有"自己 inline 事务"的路由**：
- v43-6 Batch 3 重构时把 payOrder 的事务搬到 verify-payment 路由
- 重构后 payOrder 成了孤儿（没人调）
- **重构必须同步更新所有调用方或抽出公共方法**

3. **状态变更路由（admin PATCH/POST）必须发通知**：
- approve / reject / complete / cancel / confirm / ship / adjust
- 任一状态变更都该通知受影响用户

4. **跨项目层**：这个教训不只是 mlm-platform，是所有"service + 多路由调用"项目通用

**v46.10.3 真实事故时间线**（30 分钟排查）：
- T+0：胡子哥下了一单 ¥500 后铃铛不增加
- T+5：直接调 prisma.notificationBatch.create 成功 → schema 没问题
- T+10：grep OrderService.payOrder 调用 → 只 1 行（pay 路由但已废弃）
- T+15：发现 verify-payment 路由 inline 事务，没调 payOrder → payOrder 里的 IIFE 是死代码
- T+20：抽 OrderService.notifyOrderPaid 公共方法 → verify-payment 调它
- T+30：部署验证 → 通知生成 ✅

**教训**：派单时改 service 不够，必须看 service 真实调用入口。否则就是 v46.7 → v46.10.3 这种"修了死代码"的尴尬。

---

### 铁律 12：所有 admin 状态变更路由必须自动通知用户（v46.11/v46.12 实战总结，2026-06-26 写入）

**核心教训**：admin 给用户改任何状态（调账、退款审核、发货、完成订单），用户端**不会自动收到通知**。这是同类死代码问题的延续——状态变更只写数据库，没调 sendInApp。

**v46.11 真实事故**：
- 胡子哥给测试账号充值 ¥5000
- 测试账号铃铛不增加，notification_batches 没新数据
- `/api/admin/users/[id]/balance` 路由：写 balance_record 后直接 return，没调 sendInApp

**v46.12 真实事故**：
- 退款审核通过/拒绝：review 路由只改 status，写操作日志，没通知用户
- 退款完成：complete 路由调 requestRefund → requestRefund 也不发通知
- 双重死代码嵌套

**强制规则**：

| 状态变更类型 | 必须通知 | 通知模板 |
|------|------|------|
| admin 调账（6 种 type） | ✅ | balance_change |
| 退款审核通过/拒绝 | ✅ | refund_review（用 result 变量） |
| 退款完成 | ✅ | refund_completed |
| 订单支付 | ✅ | order_paid（v46.7/v46.10.3） |
| 订单发货 | ✅ | order_shipped（v46.10.3） |
| 订单完成 | ✅ | order_completed |
| 订单取消 | ✅ | order_cancelled |
| 提现审核通过/拒绝 | ✅ | withdrawal_result（v46.3） |

**派单前 grep 模板**：
```bash
# 1. 找所有 admin 状态变更路由
rg -n "verifyPermission|requireAdmin|adminComment" src/app/api/admin/

# 2. 每个 PATCH/POST/PUT 路由确认有 sendInApp 或 NotificationService.*Notification 调用
# 没有 = 死代码
```

**模板设计原则**：
- 通用模板优先（如 refund_review 用 result 变量同时支持通过/拒绝）
- 不要为每个状态建独立模板（维护成本高）

**v46.11/v46.12 实战教训**：
- 调账 6 种 type 用 1 个 balance_change 模板 + typeLabelMap 翻译
- 退款 2 种动作（approve/reject）用 1 个 refund_review 模板 + result 变量
- **抽公共方法到 OrderService**（notifyBalanceChange / notifyRefundReview / notifyRefundCompleted）
- 路由层不直接调 sendInApp，统一走 OrderService 公共方法

---

## 📝 协作角色（v3+ 实战确定）

| 角色 | 谁 | 职责 |
|------|-----|------|
| **拍板** | 胡子哥（用户） | 业务决策 + 验收 + 传话 |
| **方案 + 审核** | mavis（我） | 审计代码 + 设计方案 + 写执行单 + 审 diff |
| **执行** | 猫爪（另一个 AI） | 改代码 + build + push + 验证部署 |

**执行单格式**（v3+ 确定）—— 见 `~/.mavis/agents/mavis/memory/MEMORY.md` 第 17 行「与胡子哥"方案-执行"协作模板」

---

## 📅 变更日志

### 2026-06-14 — v3 到 v7 完整 10 单

| 单 | 内容 | commit |
|---|------|--------|
| v3 | 后台 3 个富文本兜底 | - |
| v4 | 后台 FAQ 可编辑 | - |
| v5 | 商品复制功能 | - |
| v5-修复 1 | 3 个 Vercel 部署错误 | - |
| v5-修复 2 | isUpgradeProduct 继承 bug | - |
| v5-修复 3 | 跳转 404 → 弹窗模式 | - |
| v5-修复 4 | 删除不生效 + 复制报错 | - |
| v5-修复 5 | status 兜底 | - |
| v6 | 操作列排版 + description 修复 | `3f53bc4` |
| v7 | 文字竖排 + 高度统一 + 间距 | `bed3802` |
| v12 | 注册 500 修复：$queryRaw 表名/列名/uuid/Prisma 字段名 | `1edd3fa` |
| v17 | **注册 500 最终修复：彻底移除 $queryRawUnsafe，改用 Prisma 原生 ORM** | `84bafac` |

**v6 + v7 教训**：
- 总结出 2 条铁律（commit/push 验证、UI 改动必须本地截图）
- 商品 description HTML 漏出 = 真实事故（v6 暴露）
- 操作列排版规范固化（v7 确定）

**v12 教训**：
- 总结出铁律 4：`$queryRaw` 错误链必须一次修到底
- Prisma 模型名 ≠ 数据库表名，camelCase ≠ snake_case，必须逐层验证
- 字段名以 `schema.prisma` 为准，不能靠直觉猜

---

### 铁律 5：$queryRaw / $queryRawUnsafe 是最后手段（v17 实战总结，2026-06-15 写入）

**核心教训（注册 500 修复的最终结论）**：

Prisma 6 的 `$queryRaw` 和 `$queryRawUnsafe` 在 Vercel + Supabase (PostgreSQL) 环境下
存在**不可预测的类型处理行为**。即使本地 build 通过、代码逻辑正确，
部署后仍可能报 `text = uuid` 等类型错误。

**7 个版本的血泪时间线**：

| 版本 | commit | 尝试 | 结果 | 耗时 |
|------|--------|------|------|------|
| v0 | `f29deb2` | 增强错误信息返回 | ✅ 暴露了真实错误 | 5min |
| v1 | `0b1f879` | `"User"` → `"users"` 表名 | ❌ 还 500 | 10min |
| v2 | `74886bc` | camelCase → snake_case 列名 | ❌ 还 500 | 15min |
| v3 | `1edd3fa` | 加 `'${id}'::uuid` 类型转换 | ❌ **更离谱：text = uuid** | 20min |
| v4-v6 | `beb6441`→`3ed89d6`→`c6b6d56` | WHERE/JOIN 加 ::uuid → 去掉 ::uuid | ❌ **同样的错** | 40min |
| **v7** | **`84bafac`** | **彻底删除 $queryRawUnsafe，改用 Prisma 原生 ORM** | **✅ 成功！** | 15min |

**总耗时：约 2 小时，7 个版本，6 次失败推送**

#### 根因分析（5 层深挖）

```
第 1 层（表面现象）：POST /api/register 返回 500
         ↓
第 2 层（错误信息）：prisma.$queryRaw() invocation failed
         ↓
第 3 层（SQL 错误）：relation "User" does not exist / column "parentId" does not exist
         ↓
第 4 层（命名不匹配）：
         - Prisma 模型名 "User" ≠ PostgreSQL 实际表名 "users"
         - Prisma 字段名 "parentId" ≠ PostgreSQL 实际列名 "parent_id"
         - 这是因为 Prisma 用 @map() 做映射，但 $queryRaw 绕过了这个映射
         ↓
第 5 层（类型系统冲突）：
         - $queryRawUnsafe 的模板字面量 ${var} 在 Prisma 6 中不是纯字符串替换
         - Prisma 内部可能对参数做了额外包装/转义
         - 导致 PostgreSQL 收到的参数类型是 text 而非预期的 uuid
         - 即使加 ::uuid 也不行，因为外层已经被包成了 text
         ↓
第 6 层（根本原因）：
         **$queryRaw / $queryRawUnsafe 在 Prisma 6 + Vercel + Supabase 组合下
          存在未文档化的类型处理行为，无法可靠使用**
```

#### 走过的弯路（自我批评）

**弯路 1：在第 3 次失败时没有果断重构**
- v3（`1edd3fa`）已经暴露出 `text = uuid` 类型错误
- 我选择了"继续在 SQL 层面修补"而不是"换技术路线"
- 如果当时直接改用 Prisma 原生 ORM，可以节省后面 4 个版本（~1.5 小时）

**弯路 2：过度相信"::uuid 能解决一切"**
- v4 加了 `::uuid` → 失败
- v5 给 JOIN ON 也加了 `::uuid` → 还是失败
- v6 去掉所有 `::uuid` 靠隐式转换 → **还是同样的错误！**
- 这说明问题根本不在 `::uuid`，而是 `$queryRawUnsafe` 这个 API 本身

**弯路 3：每次修完就 push，没有等 build 到 0 错误再全面检查**
- 铁律 4 已经写了"$queryRaw 错误链必须一次修到底"
- 但我自己没执行好——v3-v6 都是在"修了一层"后就推送了

**如果重来会怎么做**：
1. 看到 `text = uuid` 错误 → **立即放弃 `$queryRawUnsafe`**，改用原生 ORM
2. 递归 CTE SQL → 用 `findMany` + 内存 BFS 替代
3. 原子 UPDATE → 用 `updateMany({ where: { ..., field: { gte: ... } } })` 替代
4. 全部改完 → build 0 错误 → 推送 → 一次性成功

#### 强制规则

1. **默认禁止使用 `$queryRaw` / `$queryRawUnsafe`**
   - 只有当 Prisma 原生 ORM **完全无法实现**时才考虑原始 SQL
   - 使用前必须：记录原因、review 通过、胡子哥确认

2. **原子操作用 `updateMany` + 条件 where 替代 `$queryRawUnsafe`**
   ```typescript
   // ✅ 正确：Prisma 原生，类型安全
   const result = await tx.user.updateMany({
     where: { id: userId, unlockedPoints: { gte: amount } },
     data: { unlockedPoints: { decrement: amount } },
   })
   if (result.count === 0) throw new Error('余额不足')

   // ❌ 禁止：$queryRawUnsafe 类型不可控
   await tx.$queryRawUnsafe(`UPDATE "users" SET ... WHERE id = '${userId}'...`)
   ```

3. **递归查询用 `findMany` + 内存遍历替代 CTE**
   - 对于当前用户量级（< 10万），内存操作性能完全够用
   - 如果未来数据量增长到百万级，再考虑用数据库视图或存储过程

**v17 真实事故**：
- v3 到 v6 共 4 次推送全部失败，每次都让胡子哥测试注册看到 500
- 最终 v7 彻底换 ORM 方案，一次成功
- 教训：**方向错了越努力越浪费**

---

### 铁律 6：支付/订单类派单必须走完整链路测试（v43-4-修复-2 实战总结，2026-06-19 写入）

**核心教训**：v43-4 我自己没走通"立即购买→verify-payment→跳转"完整链路，**只验了 build 0 错误 + 看代码逻辑**，导致 verify-payment **100% 失败的 P0 bug** 流到胡子哥面前。

**真实 bug**：
```ts
// verify-payment 路由
// 1️⃣ 事务里 updateMany 已经把 status 改 paid（成功）
await prisma.$transaction(async (tx) => {
  const updated = await tx.order.updateMany({
    where: { id, status: 'pending' },
    data: { status: 'paid', paymentVerified: true, paidAt: new Date() },
  })
})
// 2️⃣ 然后又调 payOrder，里面再次 updateMany（条件 status=pending → count=0 → 抛'订单不存在或状态已变更'）
const paidOrder = await OrderService.payOrder(orderId)
```

**强制规则**：

1. **支付/订单/支付密码/收货/库存扣减类派单**，执行后必须**走完整 happy path 模拟**：
   ```
   下单接口（create order）→ 数据库校验（库存/积分/状态）→ 支付验证（verify/pay）→ 跳转订单详情 → 订单状态从 pending → paid
   ```
   看完代码 + build 0 错误**不够**，必须 trace 一遍状态机。

2. **同类状态变更不能重复执行**：
   ```typescript
   // ❌ 禁止：在 A 处 updateMany 改 status，再调 B，B 内部又 updateMany 改同一 status
   await updateMany({ where: { status: 'pending' }, data: { status: 'paid' } })
   await someService.payOrder()  // 内部又 updateMany({ status: 'pending' }) → count=0
   
   // ✅ 正确：A 处一次改完，B 处只读不改
   await updateMany({ where: { status: 'pending' }, data: { status: 'paid', paymentVerified: true, paidAt: new Date() } })
   await RewardService.processOrderRewards(orderId)  // 只发奖励，不改 status
   ```

3. **updateMany 条件是"防并发"而不是"幂等保护"**：
   - 条件 `where: { status: 'pending' }` 是防止并发时改到错误状态
   - **不能**依赖它来"幂等跳过"——如果同一事务/调用链里改了 status，第二次 updateMany 一定 count=0

**v43-4-修复-2 真实事故**：
- 派单后我（mavis）做 v43-4-修复时只验证了 build 0 错误 + 看代码逻辑
- 没走真实"立即购买"流程
- 胡子哥测出报"订单不存在或状态已变更"
- 排查 10 分钟找到根因：verify-payment 重复调 payOrder
- 修法：删 payOrder 调用，改调 RewardService.processOrderRewards 直接发奖励

**为什么 build 没暴露**：
- TypeScript 类型完全正确（都是合法 API 调用）
- ESLint 不会报"重复调一个函数"（没有这种规则）
- 唯一的检测方法就是**走通真实业务流程**
- 铁律 1（commit/push 验证）解决"部署是否生效"
- **铁律 6（链路测试）解决"业务逻辑是否真的对"**

---

## ⚠️ 浏览器兼容提示

- **夸克**：正常
- **遨游**：有 CSS 兼容问题（CSS Grid / 某些 flex 行为异常）
- 胡子哥偏好深色导航栏 + 橙色主题（夸克风格）


### 铁律 7：新建 admin 页面 fetch 必须含 Authorization header（v46.6 实战总结，2026-06-25 写入）

**核心教训**：v46.5 新建 `src/app/admin/notification-history/page.tsx` 和 `[id]/page.tsx` 时，fetch **漏写了 `Authorization: Bearer ${token}` header**，结果：
- middleware 拦截 `/api/admin/*` 路由强制要 Bearer token，没传就 401
- 胡子哥看不到发件箱（"暂无发送记录"）
- 排查 1 小时才定位（中间踩了 enum 中文/英文不一致、SQL JOIN 模拟查询的坑）

**v46.6 修复**（commit `febe85f`）：
- 两个 fetch 加 `headers: { Authorization: \`Bearer ${token}\` }`
- token 从 `localStorage.getItem('token')` 拿

**强制规则**：

任何新建的 admin 页面 fetch 都**必须**包含：
```typescript
const token = typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''
const res = await fetch(`/api/admin/xxx`, {
  headers: { Authorization: `Bearer ${token}` },
})
```

**middleware 拦截点**（`src/middleware.ts`）：
- 所有 `/api/admin/*` 路由强制要 Bearer token（line 75-87）
- 401 时返回 `{ success: false, error: '未提供认证令牌' }` + `x-trace-id` header
- 不传就 401，前端 catch 吞掉 → 显示"暂无数据"兜底文案

**派单前必查清单**（v46.6+）：
1. grep `src/app/admin/**/*.tsx` 的 fetch 调用
2. grep `src/middleware.ts` 的 `pathRoleMap`，确认新建 API 路由角色映射
3. 任何一个 fetch 漏 header → 整个页面 401

**v46.5 真实事故时间线**（40 分钟排查）：
- T+0：胡子哥发"发件箱空"截图
- T+5：Mavis 指出"还没触发数据" → 让用户手动触发
- T+15：胡子哥触发"通用通知"失败（userId 填错"admin"） → 改用"系统公告" → 成功
- T+20：发件箱还是空 → 怀疑 API 查询 bug
- T+30：SQL JOIN 模拟查 5 条 batch → 数据没问题
- T+35：胡子哥抓 DevTools Console → 发现 401 + React hydration error #418
- T+40：Mavis 读 middleware.ts → 发现是 Authorization header 漏写

**教训**：下次 v46.5 风格的派单（新建 admin 页面），**派单前必须 grep fetch 鉴权 header 模式**，不能只看代码逻辑对不对。


### 铁律 8：派单检查清单 —— "用户能完整看到" 6 步（v46.5/v46.6/v46.7/v46.8 实战总结，2026-06-25 写入）

**核心教训**：v46.5 通知发件箱连续 4 个版本都有派单疏漏，全部是"用户根本看不到"的问题。

**4 个真实事故时间线**（2026-06-24 至 2026-06-25 凌晨）：

| 时间 | 版本 | 事故 | 排查耗时 | 修复 commit |
|------|------|------|---------|------------|
| 23:50 | v46.5 | 列表页/详情页 fetch 漏 Authorization: Bearer header → middleware 401 | 40 分钟 | v46.6 `febe85f` |
| 02:35 | v46.6 | 用户端通知页面没顶栏入口 → 测试账号找不到通知 | 立即发现 | v46.8 `830c070` |
| 02:40 | v46.7 | 业务触发 IIFE `(async()=>{...})()` 在 Vercel Serverless Function return 后被 GC 回收，batch.create 没真正执行 | 30 分钟 | v46.7 `aafcc40` |
| 02:50 | v46.8 | `/api/notifications/unread-count` API 不存在 → Header 铃铛拉不到数据 | 立即修 | v46.8 `830c070` |

**强制规则：v46.x+ 派单前 6 步检查清单**：

1. **页面存在** —— grep `src/app/**/page.tsx`，确认每个新页面都有对应文件
2. **页面有入口** —— admin 菜单（`src/lib/admin-menu.ts`）OR 顶栏铃铛（`src/components/layout/Header.tsx`）OR 侧边栏，**不能裸页面**
3. **fetch 加 Authorization** —— grep `fetch('/api/admin/`，确认每个 fetch 都有 `headers: { Authorization: \`Bearer ${token}\` }`
4. **异步操作必须 await** —— `(async()=>{...})()` 在 Vercel Serverless Function 会被 GC 回收，必须 `await (async()=>{...})()`
5. **catch 块暴露错误** —— `console.error` + `logger.error` 双重保险，含 Prisma `code` + `meta`
6. **业务链路真实跑通** —— 不只看 build + 代码，要走通真实业务流程（铁律 6）

**派单前 grep 模板**：

```bash
# 1. fetch 鉴权 header 完整性
rg -n "fetch\(`/api/admin/" src/app/admin/ --type tsx | rg -v "Authorization"

# 2. IIFE 异步模式（在 Vercel 上会被 GC）
rg -n "\(async\(\) => \{" src/lib/ --type ts

# 3. 新建 API 路由的鉴权模式
rg -n "verifyToken|verifyPermission" src/app/api/new-route/route.ts

# 4. 新建页面的入口
rg -n "admin-menu" src/lib/admin-menu.ts
```

**middleware 鉴权规则**（`src/middleware.ts`）：

- 只对 `/api/admin/*` 路径强制 Bearer token 鉴权
- 其他 API（`/api/notifications`、`/api/orders` 等）**不鉴权**，但代码里**要自己 verifyToken**
- middleware **只为 `/api/admin/*` 注入 `x-user-id` header**，其他 API 路由**不能依赖 x-user-id**

**经验教训**：

- 派单存档 ≠ 完整设计 —— 派单存档写"页面存在"，但入口可能漏写
- build 通过 ≠ 业务跑通 —— TypeScript 类型正确不等于功能正确，必须走通真实业务
- 中间件拦截规则必须列清楚 —— 任何新建 admin 路由都要查 `pathRoleMap`，新建用户路由要知道 middleware 不鉴权，靠 API 自己 verifyToken


### 铁律 9：useEffect 依赖 zustand store 函数引用会触发死循环（v46.10 实战总结，2026-06-26 写入）

**核心教训**：`useEffect` 依赖中包含 zustand store 函数引用（如 `syncFromStorage`）会触发 **React error #185 (Maximum update depth exceeded)** 死循环，进而被 Next.js 兜底为 "client-side exception" error overlay。

**v46.8 Header 铃铛真实事故**：

```tsx
// ❌ 错：依赖 [syncFromStorage, user]
useEffect(() => {
  syncFromStorage()  // 内部 set({ token, user }) 触发 zustand 更新
  if (user) {
    fetchUnread()
    setInterval(fetchUnread, 30000)
  }
}, [syncFromStorage, user])

// 死循环链路：
// effect 跑 → syncFromStorage() → set({token, user}) → store 更新
// → 组件重渲染 → effect 依赖变（user 引用变化）→ effect 重跑
// → syncFromStorage() 再 set → 重渲染 → effect 重跑 → ... 死循环
```

**症状**（胡子哥看到的）：
- `Minified React error #185` + `Maximum update depth exceeded`
- Vercel 显示 `Application error: a client-side exception has occurred`
- `/api/settings/public` 和 `/api/notifications/unread-count` 反复触发 500（effect 死循环中反复 fetch）

**v46.10 修复**：

```tsx
// ✅ 对：拆成 2 个独立 effect + 用 getState() 拿稳定函数引用
useEffect(() => {
  // 只挂一次（空依赖）
  const handleAuthChange = () => useAuthStore.getState().syncFromStorage()
  window.addEventListener('auth-change', handleAuthChange)
  return () => window.removeEventListener('auth-change', handleAuthChange)
}, [])

useEffect(() => {
  // 只依赖 user?.id（原始值），不触发 store 更新
  if (!user) return
  fetchUnread()
  const interval = setInterval(fetchUnread, 30000)
  return () => clearInterval(interval)
}, [user?.id])
```

**强制规则**：

1. **`useEffect` 依赖不要放 zustand store 函数引用**（即使看起来"稳定"）
2. **如果 effect 内部需要调 store action**，用 `useXxxStore.getState().action()` 拿函数（getState 永远稳定）
3. **如果 effect 内部需要响应 store 状态变化**，依赖**原始值**（如 `user?.id`），不要依赖**对象引用**（如 `user`、`syncFromStorage`）
4. **单 useEffect 内部不要有条件 return**（`if (user) return cleanup1; return cleanup2`），拆 effect
5. **派单前自检**：新加 useEffect 的依赖数组有没有 store 函数引用 / 对象引用

**v46.10 真实事故时间线**（30 分钟排查）：
- T+0：胡子哥报 "Application error: a client-side exception" 截图
- T+5：Playwright 访问首页 + /admin/notifications 一切正常（未登录态）
- T+10：Playwright 登录测试账号 → console 抓 4 errors
- T+15：识别 `Minified React error #185` + 两个 API 500
- T+20：grep Header.tsx useEffect → 发现 [syncFromStorage, user] 依赖陷阱
- T+25：mavis 自己改 + typecheck + push（commit `0748bf7`）
- T+30：Playwright 重测 → console 0 errors + 铃铛+未读数 4 正常

**教训**：
- build 通过 ≠ 业务跑通
- Playwright 抓 console 是定位"client-side exception"最有效的手段
- 紧急 bug 修复可由 mavis 直接 commit（不走完整派单流程）


---

### 铁律 13：所有分析报告必须包含可执行的方案建议（v60.1 实战总结，2026-07-01 写入）

**核心教训**：胡子哥 2026-07-01 明确要求 —— 「以后你做出来的所有分析，一定要有一个执行方案的建议」。**纯诊断、不给方案 = 半成品**。

**强制规则**：

1. **每个分析报告结尾必须有「执行方案建议」章节**：
   - 列出 P0/P1/P2 优先级
   - 每项给出具体行动 + 负责人 + 工时估算
   - 标明哪些 mavis 可立刻执行、哪些需胡子哥拍板

2. **派单文档格式升级**：在原有「方案 + 派单」基础上，必须多写一节「我自己接下来会做什么」(自主执行项)。

3. **盘点/审计报告 = 必带修复清单**：
   - 文档过期 → 立刻重写
   - TODO/FIXME → 给出清理优先级
   - 铁律缺口 → 建议增补
   - 临时文件 → 给出清理动作

4. **格式模板**(报告末尾固定结构)：

   ```
   ## 执行方案建议

   ### 🔴 P0 - 立刻执行（mavis 自驱）
   - [动作1] - [工时] - 预计完成时间
   - [动作2] - [工时] - 预计完成时间

   ### 🟡 P1 - 近期执行（需胡子哥确认）
   - [动作1] - 依赖 [胡子哥提供 X]

   ### 🟢 P2 - 战略规划（下一轮讨论）
   - [方向性建议]
   ```

5. **违反示例**：
   - ❌ 「项目代码没问题」(不给方案 = 浪费胡子哥时间)
   - ❌ 「建议优化」(太虚,没动作、没工时、没负责人)
   - ✅ 「P0: 更新 docs/项目清单.md 到 2026-07-01 状态,我现在 30 分钟搞定 → 直接 commit」

**v60.1 真实场景**：
- v60 全量盘点报告(2026-07-01)
- 发现 docs/项目清单.md 过期 5 天、12 个待办实际已完成
- **当时报告只列问题**,胡子哥立刻指出「根据你的计划和建议来执行好吗？以后你做出来的所有分析,一定要有一个执行方案的建议」
- **修正**：报告必须自带执行方案,不要等用户追问

**横向教训**：
- 这个铁律不只适用 mlm-platform —— 所有「分析+建议」类输出都应自带「可执行清单」
- Mavis 的核心价值 = 判断 + 温度 + **直接动手**
- 「报告完 等指示」是次优模式,「报告完 + 已自动执行 P0」是首选模式
