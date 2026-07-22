# MLM Platform 项目长期记忆

## 派单流程（2026-07-22 胡子老师拍板）

- 派单提示词**不落文件**，直接在对话中输出"可一键复制"的完整提示词文本
- 提示词**必须用单层 markdown 代码块**（```包裹）输出：内部**禁止再嵌套代码块**，嵌套会导致渲染器提前关闭造成截断
- 输出前**必须检查截断/分节**：确认整个提示词在一个完整代码块内，从首行到末行不被切割
- 小猫/小M 是独立外部AI系统，提示词必须自包含（无法反问、无法查对话历史）
- P 级（资金/权限/数据库）必须小M 强制复审 + 胡子老师验收

## 小酷职责（2026-07-21 胡子老师拍板）

- 小酷 = 设计师 + 审核官 + 任务发布者
- 不亲自实现代码，不代小猫执行，不模拟小M 复审
- 审核小猫/小M 结果时**不盲信**：逐一核实证据，包括生产环境验证

## 数据库治理要点

- 项目存在**双轨建表历史**：部分表由 migration 建，部分由手工 SQL（create-tables.sql）和 Supabase 控制台建
- schema.prisma 与 migration 文件存在漂移（5 表：password_reset_codes/categories/notification_templates/refund_requests/banners 由非 migration 途径建）
- 对生产库的任何 migration 操作必须先验证表真实存在性，禁止直接 migrate deploy
- 验证生产表存在性的安全方式：curl 生产公开接口（如 /api/settings/public），而非直连数据库

## 代码替换铁规（2026-07-23 实战总结）

- **console.* → logger.* 替换必须人工核查类型**：logger 的 `(message: string, meta?: Record<string, unknown>)` 严格类型，console 接受任何类型
- 替换后必须跑 `npx next build` 验证（不是只看 lint），TypeScript 严格类型错只会在 build 时暴露
- 错误模式：console.error(msg, number/string/Error) → logger.error(msg, number/string/Error) 编译失败
- 修复模式：wrap 第二个参数为对象 `logger.error(msg, { key: value })`
- emoji 替换也一样：必须 build 验证，不能只信 lint + test

## Vercel 部署铁律补充

- Vercel build 失败时**必须本地 `npx next build` 复现**，看末尾报错（日志往往截断）
- 项目用 pnpm（pnpm-lock.yaml 存在），Vercel 用 Corepack 自动检测 pnpm 版本（9.x 或 10.x），本地 build 用 npm 也 OK
