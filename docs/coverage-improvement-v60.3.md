# Test Coverage Improvement v60.3

> **时间**: 2026-07-01
> **维护者**: Mavis
> **目标**: Branches 56.55% → 70%
> **触发**: v60.2 收尾后胡子哥指示「下一步」,开启覆盖率深化

---

## 📊 进展追踪

| 阶段 | Statements | Branches | Functions | 备注 |
|------|------------|----------|-----------|------|
| v60.2 基线 | 66.32% | **56.55%** | 77.24% | 188 commits |
| **v60.3 batch 1** | **70.72%** | **61.21%** | 82.63% | **+4.66 个百分点** |
| 目标 | 75% | **70%** | 85% | - |

---

## ✅ v60.3 batch 1 完成 (本 commit)

### 1. `__tests__/notification/sendInApp.test.ts` (新建)
- **8 个测试** 覆盖核心分支:
  - 模板不存在 / 已禁用 → return false
  - 模板启用 + 变量替换 → 创建 notification + return true
  - subject 为 null 优雅处理
  - 异常路径(prisma 抛错)
  - 变量替换:多个变量 + 同名变量多次出现
- **覆盖前**:0% / 0% (Stmts/Branches)
- **覆盖后**:100% / 91.66%

### 2. `__tests__/config/system-parameters.test.ts` (新建)
- **19 个测试** 覆盖 33 项系统参数读写:
  - getSystemParameter 缓存命中 / 默认值 / boolean 转换 / NaN fallback
  - setSystemParameter number 校验 (min/max) / boolean 类型 / 缓存失效
  - getAllSystemParameters 31 项 / 7 分组
  - SYSTEM_PARAMETERS 自检(number 必有 min/max / boolean 必无 / group 合法)
- **覆盖前**:10.81% / 0%
- **覆盖后**:100% / 100%

### 3. `__tests__/services/withdrawal-reject-template.test.ts` (补全)
- 从 5 个测试扩到 **9 个测试**:
  - list 默认值 / enabledOnly
  - create 各种默认值组合(sortOrder + isEnabled)
  - update 部分字段更新
  - delete
- **覆盖前**:16.82% / 10.93%
- **覆盖后**:100% / 100%

---

## 📋 剩余 Branches 缺口(按 ROI 排序)

| 优先级 | 文件 | 当前 Branch | 缺口行 | 工时 | 备注 |
|--------|------|-------------|--------|------|------|
| 🔴 1 | `order-lifecycle.service.ts` | **3/32 = 9%** | 290-606 | **1.5 天** | 状态机核心,v50-n-1 拆分,7 个方法 |
| 🔴 2 | `order-notification.service.ts` | **1/31 = 3%** | 几乎全空 | **1 天** | 584 行通知实现 |
| 🟡 3 | `order.service.ts` | **10/24 = 42%** | 156-169, 191-224 | 0.5 天 | |
| 🟡 4 | `withdrawal.service.ts` | **13/31 = 42%** | 249-318 | 0.5 天 | |
| 🟡 5 | `reward.service.ts` | **22/40 = 55%** | 91-322, 371-393 | 1 天 | 业务 v2 核心 |
| 🟡 6 | `dividend.service.ts` | **14/22 = 64%** | 171-173, 290-396 | 0.5 天 | 5 级独立池 |
| 🟡 7 | `points.service.ts` | **11/18 = 61%** | 54, 96, 179-186 | 0.5 天 | |

**预计补完后 Branches**:9% + 3% + 42% + 42% + 55% + 64% + 61% 综合加权 → **75-78%**

---

## 🎯 下一步计划

### 本周内(batch 2)
- 🔴 order-lifecycle.service.ts 补全 → 预计 +10-15% Branches
- 🔴 order-notification.service.ts 补全 → 预计 +5-10% Branches

### 下周(batch 3)
- 🟡 order.service.ts / withdrawal.service.ts / reward.service.ts / dividend.service.ts / points.service.ts 关键分支

### 最终目标
- Branches ≥ 70% → 可加进 CI 强制门
- 当前 coverage 门槛只有 statements 70%,**branches 70% 是更高标准**

---

## 📌 经验教训

### 1. vi.mock 被 hoist,需要用 vi.hoisted 共享 mock 对象
普通 `const mockX = { fn: vi.fn() }` 会导致 `Cannot access 'mockX' before initialization` 错误。
正确做法:
```typescript
const mocks = vi.hoisted(() => ({ systemConfig: { findUnique: vi.fn() } }))
vi.mock('@/lib/prisma', () => ({ prisma: { systemConfig: mocks.systemConfig } }))
```

### 2. module-level cache 跨测试污染 → 用 vi.resetModules
system-parameters 的 cache 是模块级,跨测试会串。解决方案:
```typescript
beforeEach(async () => {
  vi.resetModules()
  mod = await import('@/lib/config/system-parameters') // 重新加载
})
```

### 3. 数据 mock 用 Map 而不是 mockResolvedValueOnce
mockResolvedValueOnce 是 queue 形式,跨测试串。改用 mockImplementation + Map:
```typescript
const data = new Map<string, any>()
vi.mock('@/lib/prisma', () => ({
  prisma: { systemConfig: { findUnique: vi.fn(async ({ where }) => data.get(where.key) ?? null) } }
}))
```

### 4. v8 coverage 字段是 v.b / v.s / v.f,不是 v.branches / v.statements
vitest v8 reporter 默认字段是单字母简写。pct 字段在 v4.1.x 里是 undefined,需要手算。

---

## 🎁 收益

- ✅ 通知核心(sendInApp)从「未测」→「100% 覆盖」
- ✅ 33 项系统参数配置读写从「未测」→「100% 覆盖」
- ✅ 提现拒绝模板 CRUD 从「10%」→「100% 覆盖」
- ✅ Branches 56.55% → 61.21%(+4.66 个百分点)
- ✅ Statements 66.32% → 70.72%(+4.4 个百分点)
- ✅ 155 个测试(原 87,新增 8+19+4=31 个测试)

---

**胡子哥如需跳过 order-lifecycle 大骨头,优先做 🟡 5-7(低 ROI 高速度),直接告诉我。**