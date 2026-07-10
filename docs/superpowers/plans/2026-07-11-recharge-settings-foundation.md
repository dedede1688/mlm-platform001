# 充值设置底座与业务规则执行计划

> **给执行智能体：** 按任务顺序逐项执行，每完成一个任务先运行对应测试。项目协作规则要求本轮完成后先交报告，未经猫爪审核和小酷批准，不得提交或推送。

**目标：** 在不新增数据库表、不修改页面的前提下，建立单二维码充值设置底座，并让新充值申请由服务端统一记录为二维码扫码充值。

**架构：** 新建独立的充值设置服务，集中处理配置读取、校验、事务保存和缓存失效；新建后台专用接口处理角色鉴权与操作日志；现有充值服务只消费已校验的配置。用户提交接口不再接受支付方式，由服务端固定写入 `qr_code`（二维码扫码充值）。

**技术栈：** Next.js App Router（应用路由）、TypeScript（类型系统）、Prisma（数据库访问）、Vitest（单元测试）、PostgreSQL（数据库，由 Supabase 托管）。

## 全局约束

- 不接入任何支付接口。
- 不新增数据库表，不修改 `prisma/schema.prisma`，不执行数据库迁移或数据库结构推送。
- 不修改任何页面文件；页面改造属于第二包。
- 不修改历史充值记录。
- 新充值申请的 `paymentMethod`（支付方式）只能由服务端写为 `qr_code`。
- 关闭充值只阻止新申请，不影响已有申请的审核流程。
- 只有 `super_admin`（超级管理员）和 `finance_admin`（财务管理员）可以读取、修改后台充值设置。
- 后台接口必须使用字段白名单，不接受任意系统配置键。
- 服务层只处理配置和业务事务；操作日志由接口层调用。
- 图片地址必须以 `https://` 开头，禁止本地临时图片数据。
- 代码中的新用户可见文案必须使用正常中文，禁止引入乱码。
- 未经审核不得提交或推送。

---

## 文件结构

**新建：**

- `src/lib/services/recharge-settings.service.ts`：充值设置类型、读取、校验、事务保存和缓存失效。
- `src/app/api/admin/recharge-settings/route.ts`：后台设置读取与保存接口、角色鉴权、操作日志。
- `__tests__/services/recharge-settings.test.ts`：充值设置服务测试。
- `__tests__/api/admin/recharge-settings-route.test.ts`：后台设置接口权限、字段白名单和操作日志测试。

**修改：**

- `src/lib/constants.ts`：增加 `QR_CODE: 'qr_code'`。
- `src/lib/services/recharge.service.ts`：移除用户传入支付方式；检查启用状态和二维码；固定写入二维码扫码充值。
- `src/app/api/user/recharge/route.ts`：用户提交接口不再读取或传递支付方式。
- `src/app/api/user/recharge-settings/route.ts`：返回新的单二维码设置结构。
- `src/middleware.ts`：增加后台充值设置接口的角色映射。
- `__tests__/services/recharge.test.ts`：更新充值创建和配置读取测试。

**禁止修改：**

- `prisma/**`
- `src/app/admin/**`
- `src/app/dashboard/**`
- `AGENTS.md`

---

### 任务 1：充值设置服务

**文件：**

- 新建：`src/lib/services/recharge-settings.service.ts`
- 新建测试：`__tests__/services/recharge-settings.test.ts`

**对外接口：**

```typescript
export interface RechargeSettings {
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

export type UpdateRechargeSettingsInput = RechargeSettings

export interface RechargeSettingsUpdateResult {
  previous: RechargeSettings
  current: RechargeSettings
}

export class RechargeSettingsService {
  static async getSettings(): Promise<RechargeSettings>
  static async updateSettings(input: UpdateRechargeSettingsInput): Promise<RechargeSettingsUpdateResult>
}
```

- [ ] **步骤 1：编写失败测试**

测试必须覆盖：

```typescript
describe('RechargeSettingsService', () => {
  it('读取完整的单二维码充值设置')
  it('默认关闭充值且二维码为空')
  it('启用充值但二维码为空时拒绝保存')
  it('二维码不是 https 地址时拒绝保存')
  it('最低金额不是有限正数时拒绝保存')
  it('最高金额小于最低金额时拒绝保存')
  it('只写入明确允许的九个充值配置键')
  it('在同一事务中保存全部配置')
  it('保存成功后清除业务配置缓存')
  it('返回修改前和修改后的配置快照')
  it('文本字段保存前去除首尾空格')
})
```

测试中的 Prisma 模拟对象必须包含：

```typescript
const mockPrisma = {
  systemConfig: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  $transaction: vi.fn(),
}

mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
```

- [ ] **步骤 2：确认测试失败**

运行：

```powershell
npx vitest run __tests__/services/recharge-settings.test.ts
```

预期：测试因服务文件不存在或导出不存在而失败。

- [ ] **步骤 3：实现配置键与规范化逻辑**

服务文件必须定义固定配置键，不允许接收任意键：

```typescript
const RECHARGE_CONFIG = {
  enabled: { key: 'recharge.enabled', description: '充值功能是否启用' },
  qrCodeUrl: { key: 'recharge.qr_code_url', description: '充值二维码图片地址' },
  qrCodeLabel: { key: 'recharge.qr_code_label', description: '充值二维码说明' },
  payeeName: { key: 'recharge.payee_name', description: '充值收款人名称' },
  minAmount: { key: 'recharge.min_amount', description: '最低充值金额' },
  maxAmount: { key: 'recharge.max_amount', description: '最高充值金额' },
  instruction: { key: 'recharge.instruction', description: '充值说明' },
  contactPhone: { key: 'recharge.contact_phone', description: '充值客服电话' },
  serviceTime: { key: 'recharge.service_time', description: '充值服务时间' },
} as const
```

默认值必须是：

```typescript
const DEFAULT_RECHARGE_SETTINGS: RechargeSettings = {
  enabled: false,
  qrCodeUrl: undefined,
  qrCodeLabel: '平台充值二维码',
  payeeName: undefined,
  minAmount: 1,
  maxAmount: 50000,
  instruction: '请扫码完成付款，返回本页面填写充值金额并上传付款成功截图，等待后台审核入账。',
  contactPhone: undefined,
  serviceTime: undefined,
}
```

规范化规则：

```typescript
function trimOptional(value: string | undefined): string | undefined {
  const trimmed = typeof value === 'string' ? value.trim() : undefined
  return trimmed || undefined
}

function validateSettings(input: UpdateRechargeSettingsInput): RechargeSettings {
  const normalized: RechargeSettings = {
    enabled: input.enabled === true,
    qrCodeUrl: trimOptional(input.qrCodeUrl),
    qrCodeLabel: trimOptional(input.qrCodeLabel),
    payeeName: trimOptional(input.payeeName),
    minAmount: input.minAmount,
    maxAmount: input.maxAmount,
    instruction: input.instruction.trim(),
    contactPhone: trimOptional(input.contactPhone),
    serviceTime: trimOptional(input.serviceTime),
  }

  if (normalized.enabled && !normalized.qrCodeUrl) {
    throw new Error('启用充值前请先上传充值二维码')
  }
  if (normalized.qrCodeUrl && !/^https:\/\//i.test(normalized.qrCodeUrl)) {
    throw new Error('充值二维码必须是已上传成功的 https 图片地址')
  }
  if (!Number.isFinite(normalized.minAmount) || normalized.minAmount <= 0) {
    throw new Error('最低充值金额必须是大于 0 的有效数字')
  }
  if (!Number.isFinite(normalized.maxAmount) || normalized.maxAmount <= 0) {
    throw new Error('最高充值金额必须是大于 0 的有效数字')
  }
  if (normalized.maxAmount < normalized.minAmount) {
    throw new Error('最高充值金额不能低于最低充值金额')
  }
  if (!normalized.instruction) {
    throw new Error('充值说明不能为空')
  }
  return normalized
}
```

- [ ] **步骤 4：实现读取与事务保存**

读取必须继续使用 `getBusinessConfig`（读取业务配置），以复用现有缓存：

```typescript
static async getSettings(): Promise<RechargeSettings> {
  const [enabled, qrCodeUrl, qrCodeLabel, payeeName, minAmount, maxAmount, instruction, contactPhone, serviceTime] = await Promise.all([
    getBusinessConfig('recharge.enabled', false),
    getBusinessConfig<string | undefined>('recharge.qr_code_url', undefined),
    getBusinessConfig<string | undefined>('recharge.qr_code_label', '平台充值二维码'),
    getBusinessConfig<string | undefined>('recharge.payee_name', undefined),
    getBusinessConfig('recharge.min_amount', 1),
    getBusinessConfig('recharge.max_amount', 50000),
    getBusinessConfig('recharge.instruction', DEFAULT_RECHARGE_SETTINGS.instruction),
    getBusinessConfig<string | undefined>('recharge.contact_phone', undefined),
    getBusinessConfig<string | undefined>('recharge.service_time', undefined),
  ])
  return { enabled, qrCodeUrl, qrCodeLabel, payeeName, minAmount, maxAmount, instruction, contactPhone, serviceTime }
}
```

保存前调用 `getSettings()` 获得修改前快照。事务内只对固定九个键执行 `upsert`（存在则更新，不存在则创建）。字符串值、数字和布尔值统一使用 `String(value ?? '')` 保存；可选空字段保存为空字符串，读取后规范为 `undefined`。

事务成功后必须调用：

```typescript
invalidateBusinessConfigCache()
```

返回：

```typescript
return { previous, current: normalized }
```

- [ ] **步骤 5：运行服务测试**

```powershell
npx vitest run __tests__/services/recharge-settings.test.ts
```

预期：全部通过，0 失败。

---

### 任务 2：后台充值设置接口与权限

**文件：**

- 新建：`src/app/api/admin/recharge-settings/route.ts`
- 新建测试：`__tests__/api/admin/recharge-settings-route.test.ts`
- 修改：`src/middleware.ts`

**依赖：**

- 使用任务 1 的 `RechargeSettingsService.getSettings()`。
- 使用任务 1 的 `RechargeSettingsService.updateSettings(input)`。

- [ ] **步骤 1：先编写接口失败测试**

使用 `vi.mock`（模拟）替换权限工具、充值设置服务和操作日志。测试必须覆盖：

```typescript
describe('/api/admin/recharge-settings', () => {
  it('GET 只请求超级管理员和财务管理员权限')
  it('GET 返回充值设置白名单结构')
  it('PUT 未授权时直接返回权限错误')
  it('PUT 只向服务传入九个允许字段，忽略恶意额外字段')
  it('PUT 成功后写 UPDATE 类型的 finance 操作日志')
  it('PUT 校验失败时返回 400 且不写操作日志')
})
```

白名单测试传入：

```typescript
const maliciousBody = {
  enabled: true,
  qrCodeUrl: 'https://example.com/qr.png',
  qrCodeLabel: '平台充值二维码',
  payeeName: '测试收款人',
  minAmount: 1,
  maxAmount: 50000,
  instruction: '测试说明',
  contactPhone: '13800138000',
  serviceTime: '09:00-21:00',
  'reward.referral_rate': 1,
  paymentSecret: 'malicious',
}
```

断言 `updateSettings` 只收到九个允许字段，不包含 `reward.referral_rate` 和 `paymentSecret`。

- [ ] **步骤 2：运行接口测试确认失败**

```powershell
npx vitest run __tests__/api/admin/recharge-settings-route.test.ts
```

预期：因后台充值设置接口尚不存在而失败。

- [ ] **步骤 3：增加权限中间件映射**

在 `pathRoleMap` 中增加精确路径：

```typescript
'/api/admin/recharge-settings': ['super_admin', 'finance_admin'],
```

不得加入审计员、商品管理员或客服管理员。

- [ ] **步骤 4：实现读取接口**

```typescript
export async function GET(request: NextRequest) {
  const { user: admin, error } = await verifyPermission(request, ['super_admin', 'finance_admin'])
  if (error || !admin) return error!

  try {
    const settings = await RechargeSettingsService.getSettings()
    return NextResponse.json({ success: true, data: settings })
  } catch (cause) {
    console.error('Get recharge settings error:', cause)
    return NextResponse.json({ success: false, error: '获取充值设置失败' }, { status: 500 })
  }
}
```

- [ ] **步骤 5：实现保存接口**

接口必须显式构造白名单输入：

```typescript
const body = await request.json()
const input: UpdateRechargeSettingsInput = {
  enabled: body.enabled,
  qrCodeUrl: body.qrCodeUrl,
  qrCodeLabel: body.qrCodeLabel,
  payeeName: body.payeeName,
  minAmount: body.minAmount,
  maxAmount: body.maxAmount,
  instruction: body.instruction,
  contactPhone: body.contactPhone,
  serviceTime: body.serviceTime,
}
```

调用服务成功后，在接口层记录操作日志：

```typescript
const result = await RechargeSettingsService.updateSettings(input)
await logOperation({
  userId: admin.id,
  action: 'UPDATE',
  module: 'finance',
  targetId: 'recharge-settings',
  oldValue: result.previous,
  newValue: result.current,
  ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || undefined,
  userAgent: request.headers.get('user-agent') || undefined,
})
```

参数校验错误返回 400，权限错误沿用 `verifyPermission` 返回结果，未知错误返回 500。操作日志工具自身会捕获错误，不得让日志失败影响配置保存结果。

- [ ] **步骤 6：运行接口测试**

```powershell
npx vitest run __tests__/api/admin/recharge-settings-route.test.ts
```

预期：全部通过，0 失败。

- [ ] **步骤 7：运行类型检查**

```powershell
npx tsc --noEmit -p tsconfig.typecheck.json
```

预期：0 错误。

---

### 任务 3：新充值申请固定为二维码扫码充值

**文件：**

- 修改：`src/lib/constants.ts`
- 修改：`src/lib/services/recharge.service.ts`
- 修改：`src/app/api/user/recharge/route.ts`
- 修改：`src/app/api/user/recharge-settings/route.ts`
- 修改测试：`__tests__/services/recharge.test.ts`

**接口变化：**

```typescript
export interface CreateRechargeParams {
  amount: number
  paymentProofUrl: string
  remark?: string
}
```

- [ ] **步骤 1：先更新失败测试**

将所有创建充值申请测试移除 `paymentMethod` 输入，并新增以下断言：

```typescript
it('新充值申请固定写入 qr_code，不接受用户支付方式')
it('充值关闭时拒绝创建新申请')
it('二维码未配置时拒绝创建新申请')
it('充值开启且二维码有效时正常创建申请')
it('关闭充值不影响 approveRecharge 和 rejectRecharge')
```

配置模拟必须按键返回：

```typescript
vi.mocked(getBusinessConfig).mockImplementation(async (key: string, defaultValue: any) => {
  const values: Record<string, unknown> = {
    'recharge.enabled': true,
    'recharge.qr_code_url': 'https://example.com/recharge-qr.png',
    'recharge.min_amount': 1,
    'recharge.max_amount': 50000,
  }
  return key in values ? values[key] : defaultValue
})
```

新建记录断言：

```typescript
expect(prisma.rechargeRequest.create).toHaveBeenCalledWith(
  expect.objectContaining({
    data: expect.objectContaining({
      userId: 'u1',
      amount: 500,
      paymentMethod: 'qr_code',
      paymentProofUrl: 'https://example.com/proof.png',
      status: 'pending',
    }),
  })
)
```

- [ ] **步骤 2：运行测试确认失败**

```powershell
npx vitest run __tests__/services/recharge.test.ts
```

预期：因旧服务仍要求支付方式、旧设置仍返回三种方式而失败。

- [ ] **步骤 3：增加二维码扫码常量**

```typescript
export const RECHARGE_PAYMENT_METHOD = {
  ALIPAY: 'alipay',
  WECHAT: 'wechat',
  BANK_CARD: 'bank_card',
  QR_CODE: 'qr_code',
} as const
```

保留三个历史值，不删除。

- [ ] **步骤 4：调整充值服务**

1. `CreateRechargeParams` 删除 `paymentMethod`。
2. 删除用户支付方式白名单校验。
3. `getRechargeSettings()` 改为委托：

```typescript
static async getRechargeSettings(): Promise<RechargeSettings> {
  return RechargeSettingsService.getSettings()
}
```

4. 创建申请时先读取设置：

```typescript
const settings = await RechargeSettingsService.getSettings()
if (!settings.enabled) {
  throw new Error('充值服务暂时关闭，请联系客服')
}
if (!settings.qrCodeUrl || !/^https:\/\//i.test(settings.qrCodeUrl)) {
  throw new Error('充值二维码尚未配置，请联系客服')
}
```

5. 金额范围使用 `settings.minAmount` 和 `settings.maxAmount`。
6. 创建记录固定写入：

```typescript
paymentMethod: RECHARGE_PAYMENT_METHOD.QR_CODE,
```

7. 不修改 `approveRecharge`、`rejectRecharge` 和后台查询方法的资金逻辑。

- [ ] **步骤 5：调整用户接口**

用户提交接口只读取：

```typescript
const { amount, paymentProofUrl, remark } = await request.json()
```

调用：

```typescript
const recharge = await RechargeService.createRechargeRequest(auth.userId, {
  amount,
  paymentProofUrl,
  remark,
})
```

用户接口不得读取 `userId`、`phone` 或 `paymentMethod`。响应字段白名单继续保留 `paymentMethod`，用于显示历史记录和新记录的内部类型。

用户设置读取接口继续要求登录，并返回任务 1 定义的新设置结构。

- [ ] **步骤 6：运行充值服务测试**

```powershell
npx vitest run __tests__/services/recharge.test.ts
```

预期：全部通过，0 失败。

---

### 任务 4：第一包综合验证与执行报告

**允许变更文件应严格等于：**

```text
src/lib/services/recharge-settings.service.ts
src/app/api/admin/recharge-settings/route.ts
__tests__/services/recharge-settings.test.ts
__tests__/api/admin/recharge-settings-route.test.ts
src/lib/constants.ts
src/lib/services/recharge.service.ts
src/app/api/user/recharge/route.ts
src/app/api/user/recharge-settings/route.ts
src/middleware.ts
__tests__/services/recharge.test.ts
```

- [ ] **步骤 1：检查文件范围**

```powershell
git status --short
git diff --name-only HEAD
```

如果出现页面、Prisma、AGENTS.md 或其他未列出的文件，立即停止，不要恢复或删除，向胡子老师报告。

- [ ] **步骤 2：检查禁用项**

```powershell
git diff --name-only HEAD | Select-String -Pattern 'prisma|src/app/admin|src/app/dashboard|AGENTS.md'
rg -n '\$queryRaw|\$queryRawUnsafe|prisma db push|prisma migrate' src/lib/services/recharge-settings.service.ts src/app/api/admin/recharge-settings/route.ts
```

预期：均无匹配。

- [ ] **步骤 3：运行专项测试**

```powershell
npx vitest run __tests__/services/recharge-settings.test.ts __tests__/api/admin/recharge-settings-route.test.ts __tests__/services/recharge.test.ts
```

预期：全部通过，0 失败。

- [ ] **步骤 4：运行完整测试**

```powershell
npx vitest run
```

预期：全部通过，0 失败。

- [ ] **步骤 5：运行类型检查**

```powershell
npx tsc --noEmit -p tsconfig.typecheck.json
```

预期：0 错误。

- [ ] **步骤 6：运行项目构建**

```powershell
npx next build
```

预期：编译成功，类型有效，全部页面生成成功，并出现 `/api/admin/recharge-settings`（后台充值设置接口）。

- [ ] **步骤 7：检查差异格式**

```powershell
git diff --check
```

预期：无空白错误；换行格式提示可以单独报告。

- [ ] **步骤 8：输出执行报告并停止**

报告必须包含：

1. 文件变更清单；
2. 九个配置键；
3. 权限规则；
4. 字段白名单；
5. 保存事务与缓存失效方式；
6. 新申请固定写入二维码扫码充值的证据；
7. 关闭充值阻止新申请的证据；
8. 历史审核流程未修改的证据；
9. 专项测试、完整测试、类型检查和构建结果；
10. 未完成项和风险；
11. 明确确认未提交、未推送。

完成后停止，等待猫爪只读审核。不得执行 `git add`、`git commit` 或 `git push`。
