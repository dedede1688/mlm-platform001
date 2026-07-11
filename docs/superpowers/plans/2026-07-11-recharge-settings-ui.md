# 充值设置后台与用户页面实施计划

> **给执行智能体：** 必须按任务顺序逐项执行。每完成一个任务先运行对应测试并保留结果。本计划执行人是小 M，猫爪只做独立审核与验证。猫爪审核和小酷批准前，不得提交第二包，不得推送，不得部署。

**目标：** 在第一包充值设置底座之上，完成后台充值设置、用户二维码充值页、后台审核列表兼容，以及两包合并后的完整业务链路验收。

**架构：** 后台设置表单使用独立组件，避免继续扩大财务管理主页面；用户端二维码展示也使用独立组件，充值主页面负责数据加载、申请提交和历史记录。后台和用户端均复用现有图片上传组件与凭证查看弹窗，接口继续使用第一包已经完成的设置读取、保存和服务端业务校验。

**技术栈：** Next.js App Router（应用路由）、TypeScript（类型系统）、React（界面组件）、Tailwind CSS（样式）、Vitest（单元测试）、现有 `ImageUpload`（图片上传组件）和 `ProofViewerModal`（图片查看弹窗）。

## 全局约束

- 不接入任何支付接口，不自动确认到账，不尝试唤起微信或支付宝。
- 用户付款方式只有“平台充值二维码”，新申请由服务端固定写入 `qr_code`（二维码扫码充值）。
- 用户只提交登录手机号（只读展示）、金额、付款成功截图和可选备注；不填写充值时间、交易订单号或支付渠道。
- 后台只维护一张当前二维码；停用充值只阻止新申请，不影响历史记录和已有待审核申请。
- 不新增数据库表，不修改 `prisma/schema.prisma`，不执行数据库迁移或结构推送。
- 不修改提现、奖励、收益、退款业务。
- 后台接口请求必须携带 `Authorization: Bearer ${token}`（认证令牌）。
- 二维码和付款截图只接受 `https://` 开头的网络图片地址；禁止保存 `data:` 开头的本地临时图片数据。
- 所有新增用户可见文案使用正常中文。
- 第一包本地提交为 `e9e5adc`，远程 `origin/main` 仍为 `ccefe03`。第二包审核完成前绝对不得 `git push`（推送）。
- 第二包通过猫爪审核后，只允许本地提交；完整页面实测通过后，才允许把本地 4 个提交一起推送并部署。

---

## 文件结构

**新建：**

- `src/components/admin/RechargeSettingsPanel.tsx`：后台充值设置独立表单，负责读取、编辑、上传二维码、预览和保存。
- `src/components/recharge/RechargeQrPanel.tsx`：用户端二维码展示、查看大图、保存二维码及付款指引。
- `__tests__/components/recharge-settings-ui.test.ts`：后台设置、用户页面和审核列表的界面契约测试。

**修改：**

- `src/app/admin/finance/page.tsx`：增加“充值设置”标签页；删除充值审核的支付方式筛选；补充 `qr_code` 中文映射。
- `src/app/dashboard/recharge/page.tsx`：接入新设置结构、读取手机号、展示二维码、简化申请表单、处理停用状态和历史记录兼容。

**禁止修改：**

- `prisma/**`
- `src/lib/services/recharge-settings.service.ts`
- `src/lib/services/recharge.service.ts`
- `src/app/api/admin/recharge-settings/route.ts`
- `src/app/api/user/recharge/route.ts`
- `src/middleware.ts`
- `AGENTS.md`

---

### 任务 1：建立第二包界面契约测试

**文件：**

- 新建：`__tests__/components/recharge-settings-ui.test.ts`

**接口约定：**

- 后台设置组件导出默认组件 `RechargeSettingsPanel`。
- 用户二维码组件导出默认组件 `RechargeQrPanel`。
- 财务页面支持 `settings`（充值设置）标签页。
- 用户提交请求不再发送 `paymentMethod`（支付方式）。

- [ ] **步骤 1：先写失败测试**

测试读取源码并锁定关键业务约束，至少包含以下断言：

```typescript
import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8')

describe('充值设置第二包界面契约', () => {
  it('后台财务页接入独立充值设置组件并增加第四个标签页', () => {
    const source = read('src/app/admin/finance/page.tsx')
    expect(source).toContain("import RechargeSettingsPanel from '@/components/admin/RechargeSettingsPanel'")
    expect(source).toContain("'settings'")
    expect(source).toContain('充值设置')
    expect(source).toContain('<RechargeSettingsPanel')
  })

  it('后台充值审核删除支付方式筛选并兼容二维码历史显示', () => {
    const source = read('src/app/admin/finance/page.tsx')
    expect(source).not.toContain('rechargePaymentMethod')
    expect(source).not.toContain('RECHARGE_PAYMENT_METHOD_OPTIONS')
    expect(source).toContain("qr_code: '二维码扫码充值'")
  })

  it('用户端不再选择或提交支付方式', () => {
    const source = read('src/app/dashboard/recharge/page.tsx')
    expect(source).not.toContain('setPaymentMethod')
    expect(source).not.toContain('请选择支付方式')
    expect(source).not.toContain('paymentMethod,')
    expect(source).toContain("qr_code: '二维码扫码充值'")
  })

  it('用户端停用时隐藏申请表单但保留充值记录', () => {
    const source = read('src/app/dashboard/recharge/page.tsx')
    expect(source).toContain('充值服务暂时关闭，请联系客服')
    expect(source).toContain('充值记录')
    expect(source).toContain('settings?.enabled')
  })

  it('两个独立组件包含二维码上传、查看和保存入口', () => {
    const admin = read('src/components/admin/RechargeSettingsPanel.tsx')
    const user = read('src/components/recharge/RechargeQrPanel.tsx')
    expect(admin).toContain('/api/admin/recharge-settings')
    expect(admin).toContain('ImageUpload')
    expect(admin).toContain('ProofViewerModal')
    expect(user).toContain('查看大图')
    expect(user).toContain('保存二维码')
  })
})
```

- [ ] **步骤 2：运行测试确认失败**

运行：

```powershell
npx vitest run __tests__/components/recharge-settings-ui.test.ts
```

预期：测试失败，原因是两个新组件不存在，财务页和用户充值页尚未改造。

---

### 任务 2：实现后台充值设置独立组件

**文件：**

- 新建：`src/components/admin/RechargeSettingsPanel.tsx`
- 测试：`__tests__/components/recharge-settings-ui.test.ts`

**输入：**

```typescript
interface RechargeSettingsPanelProps {
  token: string
  onMessage: (type: 'success' | 'error', text: string) => void
}
```

**内部数据：**

```typescript
interface RechargeSettingsForm {
  enabled: boolean
  qrCodeUrl: string
  qrCodeLabel: string
  payeeName: string
  minAmount: number
  maxAmount: number
  instruction: string
  contactPhone: string
  serviceTime: string
}
```

- [ ] **步骤 1：实现读取状态和错误状态**

组件首次挂载时请求：

```typescript
const response = await fetch('/api/admin/recharge-settings', {
  headers: { Authorization: `Bearer ${token}` },
})
```

要求：

- `401` 或 `403` 跳转 `/login`（登录页）。
- 成功时把返回值转换为完整表单，所有可选字符串缺失时写成空字符串。
- 失败时显示“获取充值设置失败”，不得伪装成空配置。
- 加载期间显示旋转图标和“正在读取充值设置”。

- [ ] **步骤 2：实现完整设置表单**

表单包含：

1. 启用或停用开关。
2. 二维码图片上传。
3. 二维码说明。
4. 收款人名称。
5. 最低充值金额。
6. 最高充值金额。
7. 充值说明。
8. 客服电话。
9. 服务时间。

开关必须使用真正的复选框或开关控件；金额使用数字输入框；说明使用多行文本框。停用时显示说明：“停用后只阻止用户提交新的充值申请，历史记录和已有待审核申请仍可正常处理。”

- [ ] **步骤 3：接入二维码上传与网络地址拦截**

复用：

```tsx
<ImageUpload
  value={form.qrCodeUrl}
  onChange={handleQrCodeChange}
  label=""
  placeholder="上传充值二维码或输入图片链接"
  bucket="images"
  folder="recharge-qr-codes"
  maxSizeMB={10}
  disabled={saving}
/>
```

`handleQrCodeChange` 必须满足：

```typescript
const handleQrCodeChange = (url: string) => {
  if (url && !/^https:\/\//i.test(url)) {
    setQrWarning('二维码未上传到云端，请重新上传或使用 https 图片链接')
    setForm((current) => ({ ...current, qrCodeUrl: '' }))
    return
  }
  setQrWarning('')
  setForm((current) => ({ ...current, qrCodeUrl: url }))
}
```

二维码存在时提供“查看大图”和“删除二维码”操作；查看大图复用：

```tsx
<ProofViewerModal url={previewUrl} onClose={() => setPreviewUrl(null)} />
```

- [ ] **步骤 4：实现保存前校验与保存**

前端只做即时反馈，后端继续作为最终校验：

- 启用时二维码不能为空且必须是 `https://` 地址。
- 最低和最高金额必须是大于零的有限数字。
- 最高金额不能低于最低金额。
- 充值说明不能为空。
- 保存期间按钮禁用，防止重复提交。

请求：

```typescript
const response = await fetch('/api/admin/recharge-settings', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify(form),
})
```

保存成功后必须重新执行读取请求，以数据库实际结果覆盖当前表单，并显示“充值设置已保存”。失败时保留用户输入并显示接口返回的具体中文错误。

- [ ] **步骤 5：运行界面契约测试**

运行：

```powershell
npx vitest run __tests__/components/recharge-settings-ui.test.ts
```

预期：与后台设置组件有关的断言通过，其余页面断言仍可能失败。

---

### 任务 3：把充值设置接入财务管理并调整审核列表

**文件：**

- 修改：`src/app/admin/finance/page.tsx`
- 测试：`__tests__/components/recharge-settings-ui.test.ts`

**依赖：**

- 使用任务 2 的 `RechargeSettingsPanel`。

- [ ] **步骤 1：增加第四个标签页**

增加导入：

```typescript
import RechargeSettingsPanel from '@/components/admin/RechargeSettingsPanel'
```

把标签状态改为：

```typescript
const [activeTab, setActiveTab] = useState<'rewards' | 'withdrawals' | 'recharge' | 'settings'>('withdrawals')
```

在“充值审核”之后增加“充值设置”按钮，并使用现有标签按钮样式。设置内容只渲染独立组件：

```tsx
{activeTab === 'settings' && token && (
  <RechargeSettingsPanel token={token} onMessage={showMessage} />
)}
```

- [ ] **步骤 2：删除充值审核的支付方式筛选**

删除：

- `rechargePaymentMethod` 状态。
- `RECHARGE_PAYMENT_METHOD_OPTIONS` 常量。
- `fetchRecharges` 中的 `paymentMethod` 查询参数。
- 充值审核筛选栏中的“全部方式”下拉框。

保留状态筛选、手机号或昵称搜索、分页和全部审核操作。

- [ ] **步骤 3：兼容新旧记录中文显示**

映射必须是：

```typescript
const RECHARGE_PAYMENT_METHOD_MAP: Record<string, string> = {
  qr_code: '二维码扫码充值',
  alipay: '支付宝',
  wechat: '微信',
  bank_card: '银行卡',
  other: '其他',
}
```

不得修改历史数据库记录。列表、通过弹窗、拒绝弹窗继续使用这一个映射。

- [ ] **步骤 4：运行测试和类型检查**

运行：

```powershell
npx vitest run __tests__/components/recharge-settings-ui.test.ts
npx tsc --noEmit -p tsconfig.typecheck.json
```

预期：界面契约中后台相关断言通过，类型检查零错误。

---

### 任务 4：实现用户端二维码展示组件

**文件：**

- 新建：`src/components/recharge/RechargeQrPanel.tsx`
- 测试：`__tests__/components/recharge-settings-ui.test.ts`

**输入：**

```typescript
interface RechargeQrPanelProps {
  qrCodeUrl: string
  qrCodeLabel?: string
  payeeName?: string
  instruction: string
}
```

- [ ] **步骤 1：实现二维码和付款指引**

组件展示：

- 二维码原图，使用稳定的正方形容器，不让图片加载改变布局。
- 二维码说明和收款人名称（存在才展示）。
- “使用另一部设备直接扫码付款”。
- “也可以保存二维码，在付款软件的扫一扫中从相册识别”。
- “付款完成后返回本页面，填写金额并上传付款成功截图”。

不得出现“点击立即付款”“自动到账”或“已确认收款”等误导文案。

- [ ] **步骤 2：实现查看大图**

“查看大图”按钮打开现有 `ProofViewerModal`，弹窗关闭后仍停留在充值页面。

- [ ] **步骤 3：实现保存二维码和失败兜底**

保存流程：

```typescript
const saveQrCode = async () => {
  try {
    const response = await fetch(qrCodeUrl)
    if (!response.ok) throw new Error('下载失败')
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = '平台充值二维码.png'
    anchor.click()
    URL.revokeObjectURL(objectUrl)
  } catch {
    setViewerOpen(true)
    toast.error('浏览器未能直接保存，请在大图中长按二维码保存')
  }
}
```

按钮使用下载图标和“保存二维码”文字。下载失败不得跳转新窗口。

- [ ] **步骤 4：运行界面契约测试**

运行：

```powershell
npx vitest run __tests__/components/recharge-settings-ui.test.ts
```

预期：用户二维码组件相关断言通过。

---

### 任务 5：改造用户充值页面

**文件：**

- 修改：`src/app/dashboard/recharge/page.tsx`
- 测试：`__tests__/components/recharge-settings-ui.test.ts`
- 回归测试：`__tests__/components/proof-viewer-modal.test.ts`

**依赖：**

- 用户设置接口返回第一包 `RechargeSettings` 结构。
- 用户信息从 `/api/users/me`（当前用户接口）读取。
- 二维码展示使用任务 4 的 `RechargeQrPanel`。

- [ ] **步骤 1：替换设置类型并读取手机号**

设置类型改为：

```typescript
interface RechargeSettings {
  enabled: boolean
  qrCodeUrl?: string
  qrCodeLabel?: string
  payeeName?: string
  minAmount: number
  maxAmount: number
  instruction: string
  contactPhone?: string
  serviceTime?: string
}
```

新增 `userPhone` 状态，并在页面初始化时与设置、记录并行读取：

```typescript
const response = await fetch('/api/users/me', {
  headers: { Authorization: `Bearer ${authToken}` },
})
```

只取 `data.phone` 展示，不接受用户修改，不把手机号放进充值提交请求。

- [ ] **步骤 2：删除旧支付方式状态和界面**

删除：

- `paymentMethod` 状态。
- `METHOD_ICON`。
- 支付宝、微信和银行卡图标导入。
- 旧收款账号展示区域。
- 支付方式选择区域。
- 提交前“请选择支付方式”校验。
- 请求体中的 `paymentMethod`。

历史记录映射保留并增加：

```typescript
const PAYMENT_METHOD_MAP: Record<string, string> = {
  qr_code: '二维码扫码充值',
  alipay: '支付宝',
  wechat: '微信',
  bank_card: '银行卡',
}
```

- [ ] **步骤 3：实现启用状态页面**

当 `settings.enabled === true` 且 `settings.qrCodeUrl` 存在时：

1. 展示 `RechargeQrPanel`。
2. 展示充值申请表单。
3. 表单第一项为当前手机号只读输入框。
4. 表单其余内容只保留金额、付款成功截图、备注和提交按钮。
5. 金额限制使用设置中的最低和最高金额。

只读手机号示例：

```tsx
<input
  type="text"
  value={userPhone}
  readOnly
  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-gray-700"
/>
```

- [ ] **步骤 4：实现停用状态页面**

当 `settings.enabled !== true` 时：

- 隐藏二维码。
- 隐藏充值申请表单。
- 显示“充值服务暂时关闭，请联系客服”。
- 存在客服电话时显示客服电话。
- 存在服务时间时显示服务时间。
- 充值记录区域始终继续展示。

注意：设置读取失败不能错误显示为“充值关闭”。读取失败应显示“充值设置读取失败，请稍后刷新”，同时继续展示历史记录。

- [ ] **步骤 5：保持付款截图和历史凭证弹窗**

付款截图继续复用 `ImageUpload`，并保留 `https://` 地址拦截。历史记录“查看凭证”继续复用 `ProofViewerModal`，不得打开新窗口。

- [ ] **步骤 6：运行用户端测试和类型检查**

运行：

```powershell
npx vitest run __tests__/components/recharge-settings-ui.test.ts __tests__/components/proof-viewer-modal.test.ts
npx tsc --noEmit -p tsconfig.typecheck.json
```

预期：全部通过，类型检查零错误。

---

### 任务 6：全量自动验证与提交前审计

**文件：**

- 不新增业务文件。
- 只允许修复本计划涉及文件中由本包引入的问题。

- [ ] **步骤 1：检查文件范围**

运行：

```powershell
git status --short
git diff --name-only HEAD
git diff --check
```

预期只包含：

```text
__tests__/components/recharge-settings-ui.test.ts
src/app/admin/finance/page.tsx
src/app/dashboard/recharge/page.tsx
src/components/admin/RechargeSettingsPanel.tsx
src/components/recharge/RechargeQrPanel.tsx
```

不得出现 `AGENTS.md`、`prisma/**`、临时脚本或构建产物。

- [ ] **步骤 2：运行第二包专项测试**

```powershell
npx vitest run __tests__/components/recharge-settings-ui.test.ts __tests__/components/proof-viewer-modal.test.ts
```

预期：全部通过。

- [ ] **步骤 3：运行第一包回归测试**

```powershell
npx vitest run __tests__/services/recharge-settings.test.ts __tests__/api/admin/recharge-settings-route.test.ts __tests__/services/recharge.test.ts
```

预期：93 项测试继续全部通过。

- [ ] **步骤 4：运行全量测试、类型检查和构建**

```powershell
npx vitest run
npx tsc --noEmit -p tsconfig.typecheck.json
npx next build
```

预期：全量测试零失败、类型检查零错误、项目构建成功。

- [ ] **步骤 5：输出执行报告并暂停**

报告必须包含：

1. `git status --short`。
2. 变更文件清单。
3. 后台设置读取、上传、保存和停用逻辑。
4. 用户端二维码、保存、只读手机号、停用状态和历史记录逻辑。
5. 后台审核列表新旧记录兼容说明。
6. 专项测试、第一包回归、全量测试、类型检查和构建结果。
7. 未完成项和浏览器实测风险。
8. 明确确认未提交、未推送、未部署、未修改数据库。

到此停止。把报告交给猫爪只读复审，猫爪不得修改代码。

---

### 任务 7：猫爪复审通过后的本地提交

本任务只有在猫爪复审通过且小酷明确批准后执行。

- [ ] **步骤 1：只暂存第二包 5 个文件**

```powershell
git add -- `
  __tests__/components/recharge-settings-ui.test.ts `
  src/app/admin/finance/page.tsx `
  src/app/dashboard/recharge/page.tsx `
  src/components/admin/RechargeSettingsPanel.tsx `
  src/components/recharge/RechargeQrPanel.tsx
```

不得使用 `git add .`。

- [ ] **步骤 2：核对暂存范围**

```powershell
git diff --cached --name-only
git diff --cached --stat
```

预期恰好 5 个文件。

- [ ] **步骤 3：创建本地提交**

```powershell
git commit -m "feat: complete recharge settings flow"
```

中文含义：完成充值设置和二维码充值闭环。

- [ ] **步骤 4：确认仍未推送**

```powershell
git status --short
git log --oneline -5
git log origin/main --oneline -1
git rev-list --count origin/main..HEAD
```

预期：

- 工作区干净。
- 远程仍为 `ccefe03`。
- 本地领先远程 5 个提交：设计文档、第一包计划、第一包代码、第二包计划、第二包代码。
- 不执行 `git push`（推送）。

---

### 任务 8：两包合并后的真实业务链路验收

本任务在第二包本地提交完成后执行，但推送前先在本地开发服务器测试。

- [ ] **步骤 1：启动本地开发服务器**

```powershell
pnpm dev
```

使用真实浏览器登录后台和用户端。后台路径为 `/admin/finance`（后台财务管理），用户路径为 `/dashboard/recharge`（用户充值页面）。

- [ ] **步骤 2：后台设置链路**

1. 进入“充值设置”。
2. 上传测试二维码。
3. 设置最低金额、最高金额、充值说明、客服电话和服务时间。
4. 启用充值并保存。
5. 刷新页面，确认设置仍然存在。
6. 截图后台设置页面。

- [ ] **步骤 3：用户申请链路**

1. 用户刷新充值页并看到新二维码。
2. 验证“查看大图”和“保存二维码”。
3. 验证手机号只读。
4. 验证页面没有支付宝、微信、银行卡选择。
5. 输入范围内金额并上传付款成功截图。
6. 提交申请，确认新记录显示“二维码扫码充值”。
7. 截图用户充值页面和新记录。

- [ ] **步骤 4：后台审核闭环**

1. 后台充值审核看到新申请。
2. 查看付款凭证。
3. 审核通过。
4. 验证用户购物余额增加对应金额。
5. 验证余额流水、充值审核日志、操作日志和用户通知生成。

- [ ] **步骤 5：停用边界链路**

1. 后台停用充值并保存。
2. 用户刷新后看不到二维码和申请表单。
3. 用户仍能看到历史充值记录和客服电话。
4. 直接调用用户提交接口应被服务端拒绝。
5. 停用前已有待审核申请仍可在后台通过或拒绝。

- [ ] **步骤 6：最终推送前停下**

输出完整实测报告、截图路径、数据库核验结果和问题清单。未经胡子老师最终确认，不得推送。

---

## 最终推送规则

只有以下条件全部满足后，才允许执行最终推送：

1. 第一包和第二包自动测试全部通过。
2. 猫爪只读复审通过。
3. 本地真实页面和完整充值链路通过。
4. 胡子老师明确批准推送。
5. 推送后立即运行 `git log origin/main --oneline -1`，确认远程提交编号等于本地最新提交。
6. 等待 Vercel（自动部署平台）状态为 `Ready`（准备好）后，再做生产环境强制刷新验收。
