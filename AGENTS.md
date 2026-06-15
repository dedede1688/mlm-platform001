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

**v6 + v7 教训**：
- 总结出 2 条铁律（commit/push 验证、UI 改动必须本地截图）
- 商品 description HTML 漏出 = 真实事故（v6 暴露）
- 操作列排版规范固化（v7 确定）

**v12 教训**：
- 总结出铁律 4：`$queryRaw` 错误链必须一次修到底
- Prisma 模型名 ≠ 数据库表名，camelCase ≠ snake_case，必须逐层验证
- 字段名以 `schema.prisma` 为准，不能靠直觉猜

---

## ⚠️ 浏览器兼容提示

- **夸克**：正常
- **遨游**：有 CSS 兼容问题（CSS Grid / 某些 flex 行为异常）
- 胡子哥偏好深色导航栏 + 橙色主题（夸克风格）
