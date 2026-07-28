# 支付密码回归6位数字与存量兼容设计

> 状态：业务规则已由胡子老师确认，等待书面设计复核
> 日期：2026-07-28
> 等级：P级（支付密码、订单支付和提现鉴权）
> 基线：`d09abac928540c9581d58fe36cb980c339a7f27e`

## 1. 背景与根因

项目原本使用“恰好6位数字”的支付密码。提交 `430ea62142d752a9e7ef82588b7bca20ed47578e` 将新密码规则改成“至少6位且同时包含字母和数字”，同时增加了连续5次错误后锁定15分钟的保护。

该提交把两个不同概念混在了一起：

1. **新密码格式**：只应在设置支付密码、修改为新支付密码时校验。
2. **已有密码验证**：支付、提现、修改密码时验证旧密码，只应确认输入非空并交给后端做哈希比对。

当前结账、订单支付弹窗和提现页面在提交前按“字母+数字”校验已有密码。提交说明虽然写着“存量不强制失效”，但旧的6位数字密码会被前端拦截，无法进入后端验证。

当前还存在两种口径：

- 大部分页面提示“至少6位，需含字母和数字”。
- `src/app/payment/order/[orderId]/page.tsx` 仍提示“请输入6位支付密码”。
- `src/app/dashboard/payment-password/page.tsx` 的注释仍写“前端校验：6位数字”，但实际正则已经变成字母数字混合。

## 2. 已确认业务规则

胡子老师已确认采用以下规则：

1. 新设置的支付密码必须是**恰好6位数字**。
2. 修改支付密码时，新密码必须是**恰好6位数字**。
3. 支付、提现以及修改密码时验证旧密码，不做新密码格式校验；只检查输入非空，然后由后端对比 bcrypt 哈希。
4. 已经设置的字母数字混合支付密码继续有效，不强制重置。
5. 已经设置的旧6位数字支付密码继续有效。
6. 连续输错5次锁定15分钟的机制完整保留。
7. bcrypt 哈希方式、盐轮数和数据库字段不变。
8. 不新增数据库迁移，不批量修改或清空任何用户支付密码。

## 3. 方案比较

### 方案A：新密码统一6位数字，验证已有密码不检查格式（采用）

优点：

- 符合移动端支付习惯。
- 修复旧密码被前端误拦截的问题。
- 不需要数据库迁移或强制重置。
- 与现有5次错误锁定15分钟的在线防猜测机制配合。
- 清楚分离“新密码策略”和“已有凭据验证”。

代价：

- 存量期内系统需要同时接受旧字母数字密码和新6位数字密码进行哈希验证。
- 支付输入框暂时不能强制只弹数字键盘，否则字母数字存量用户无法输入。

### 方案B：继续要求字母和数字

优点是组合空间更大；缺点是移动端输入成本高，与胡子老师确认的业务体验不符，而且仍需单独修复存量密码验证入口。

### 方案C：新密码同时允许6位数字或字母数字混合

兼容性最高，但规则难以向用户解释，长期会形成两套新密码标准，不利于客服和测试，因此不采用。

## 4. 设计原则

### 4.1 分离“创建规则”和“验证规则”

新增纯客户端/服务端共用的支付密码策略模块：

```text
src/lib/validations/payment-password-policy.ts
```

建议公开接口：

```typescript
export const PAYMENT_PASSWORD_LENGTH = 6

export function isValidNewPaymentPassword(password: string): boolean {
  return /^\d{6}$/.test(password)
}
```

函数名必须包含 `New`，明确它只用于设置或修改后的新密码，不得用于支付、提现或旧密码验证。

`src/lib/auth/payment-password.ts` 只保留：

- bcrypt 哈希；
- bcrypt 比对；
- 错误次数和锁定状态处理。

移除其中容易被误用的通用名称 `isValidPaymentPassword`。所有调用方必须按场景选择：

```text
设置/修改新密码 → isValidNewPaymentPassword
验证已有密码   → 非空检查 + verifyPaymentPassword
```

### 4.2 设置和修改页面

`src/app/dashboard/payment-password/page.tsx`：

- 新密码和确认密码只保留数字，最大长度6位。
- 新密码和确认密码可使用 `inputMode="numeric"`。
- 设置和修改时均使用共用的 `isValidNewPaymentPassword`。
- 文案统一为“支付密码必须为6位数字”。
- 修改模式下的“当前密码”输入框必须继续允许字母和数字，不能过滤非数字字符，因为存量字母数字密码仍需验证。
- 当前密码只检查非空，不检查是否为6位数字。
- 保留“新密码不能与旧密码相同”的校验。

### 4.3 设置和修改API

以下路由仅对新密码应用6位数字规则：

- `POST /api/user/payment-password/set`
- `PUT /api/user/payment-password/update`

行为：

- 设置接口的 `password` 使用 `isValidNewPaymentPassword`。
- 修改接口的 `newPassword` 使用 `isValidNewPaymentPassword`。
- 修改接口的 `oldPassword` 只检查非空，再做锁定检查和 bcrypt 比对。
- 格式错误统一返回400和“支付密码必须为6位数字”。
- 保留现有鉴权、哈希、错误次数、锁定、成功后清零逻辑。
- 当前未实际使用的 Zod schema、`parseBody` 和相关导入不得继续保留成误导性死代码；本批只删除与这两个路由支付密码格式校验直接相关的未使用定义。

### 4.4 支付和提现入口

以下入口验证的是已有密码，不得调用 `isValidNewPaymentPassword`，也不得使用任何字母数字混合或6位数字正则拦截：

- `src/components/checkout/CheckoutDialog.tsx`
- `src/components/dashboard/PaymentPasswordModal.tsx`
- `src/app/dashboard/withdrawals/page.tsx`
- `src/app/payment/order/[orderId]/page.tsx`
- `src/app/api/orders/[id]/verify-payment/route.ts`
- `src/app/api/orders/[id]/route.ts`
- `src/app/api/withdrawals/route.ts`
- `src/lib/services/order-lifecycle.service.ts`

前端行为：

- 只在输入为空时阻止提交并提示“请输入支付密码”。
- 非空时原样提交给后端。
- 输入框不得过滤字母，保留存量字母数字密码的输入能力。
- 通用占位文案使用“请输入支付密码”，不声称所有存量密码都是6位数字。

后端行为：

- 只检查输入非空。
- 按现有顺序执行用户/订单归属校验、锁定检查、bcrypt 比对、失败次数累加或成功清零。
- 不修改支付事务、提现事务、余额扣减、库存、积分、奖励或通知逻辑。

### 4.5 存量兼容

数据库只保存 bcrypt 哈希，无法也不需要判断原密码格式。

兼容方式：

```text
用户输入原支付密码
→ 前端只做非空检查
→ 后端检查锁定状态
→ bcrypt.compare(原始输入, 现有哈希)
→ 正确则继续支付/提现，错误则累计失败次数
```

因此：

- 旧6位数字密码继续工作。
- 现有字母数字密码继续工作。
- 用户下次主动修改时，新密码必须改为6位数字。
- 不做明文读取、密码格式推断、批量重置或数据库迁移。

## 5. 文件边界

允许实施批次修改：

- `src/lib/validations/payment-password-policy.ts`（新增）
- `src/lib/auth/payment-password.ts`
- `src/app/api/user/payment-password/set/route.ts`
- `src/app/api/user/payment-password/update/route.ts`
- `src/app/dashboard/payment-password/page.tsx`
- `src/components/checkout/CheckoutDialog.tsx`
- `src/components/dashboard/PaymentPasswordModal.tsx`
- `src/app/dashboard/withdrawals/page.tsx`
- `src/app/payment/order/[orderId]/page.tsx`
- 与支付密码策略、设置/修改API、支付/提现存量兼容直接相关的 `__tests__/` 文件

原则上不需要修改以下后端验证链；实施者必须只读核对它们没有格式拦截：

- `src/app/api/orders/[id]/verify-payment/route.ts`
- `src/app/api/orders/[id]/route.ts`
- `src/app/api/withdrawals/route.ts`
- `src/lib/services/order-lifecycle.service.ts`

如果真实代码证据显示这些文件必须修改，实施者应停止并报告，不得自行扩大范围。

## 6. 明确禁止

- 禁止修改 Prisma Schema 或 migration。
- 禁止查询、导出或批量重置用户支付密码哈希。
- 禁止修改 bcrypt `SALT_ROUNDS`。
- 禁止移除或弱化5次错误锁定15分钟机制。
- 禁止绕过后端支付密码验证。
- 禁止修改订单支付状态机、余额扣减、提现金额、库存、积分、奖励、分红或通知。
- 禁止把登录密码规则与支付密码规则合并。
- 禁止强制存量字母数字密码立即失效。
- 禁止顺手重构无关代码。
- 小猫不得 commit、push、部署或写数据库。

## 7. TDD与测试设计

实施必须先写失败测试并保留首次失败证据，再写最小实现。

### 7.1 新密码策略单元测试

新增或拆分策略测试，至少证明：

- `000000`、`123456`、`987654` 合法。
- `12345`、`1234567` 非法。
- `abc123`、`abcdef`、`12 345`、`１２３４５６`、空字符串非法。
- 策略模块不依赖 Prisma、bcrypt 或浏览器对象。

### 7.2 设置和修改API测试

至少证明：

- 设置接口接受6位数字并保存 bcrypt 哈希。
- 设置接口拒绝字母数字混合、少于6位和多于6位。
- 修改接口允许旧密码是字母数字混合，只对 `newPassword` 应用6位数字规则。
- 修改成功后仍清零失败次数和锁定状态。
- 旧密码错误和锁定响应保持现有语义。

### 7.3 支付与提现存量兼容测试

至少证明：

- 订单支付入口提交正确的旧6位数字密码不会被前端格式规则拦截。
- 订单支付入口提交正确的存量字母数字密码不会被前端格式规则拦截。
- 提现入口对上述两类存量密码均会提交后端验证。
- `PaymentPasswordModal` 对任意非空存量密码允许确认，空输入不允许确认。
- 后端仍以 bcrypt 比对结果决定成功或失败。

允许沿用项目现有的组件源码契约测试风格，但断言必须针对行为边界，不能只检查一条中文文案。

### 7.4 防回归检查

必须证明支付/提现验证入口中不存在以下旧规则：

```text
^(?=.*[a-zA-Z])(?=.*\d).{6,}$
```

同时证明该入口没有改成 `^\d{6}$`；已有密码验证必须是非空检查，而不是新密码格式检查。

## 8. 完整链路验收

按照项目支付链路铁律，不能只看 build。至少验证：

1. 新用户设置 `123456` 成功。
2. 新用户设置 `abc123` 被拒绝，提示“支付密码必须为6位数字”。
3. 使用 `123456` 完成“创建订单 → 验证支付密码 → 订单从 pending 变为 paid”。
4. 使用一名已有字母数字支付密码的测试用户完成同一支付链路。
5. 两类存量密码都能提交提现申请。
6. 连续输入错误密码5次后仍锁定15分钟。
7. 锁定期间正确密码也不能绕过锁定。
8. 锁定到期或成功验证后的失败次数重置逻辑不变。
9. 支付成功只发生一次，不重复更新订单状态、不重复扣余额、不重复发奖励。

真实字母数字存量测试账号如果无法安全取得，实施者不得读取或重置生产密码；应通过自动化测试证明兼容，并由胡子老师在受控测试账号上做最终验收。

## 9. 验证命令

实施完成后必须执行：

```powershell
.\node_modules\.bin\vitest.cmd run __tests__\lib\payment-password-lock.test.ts
.\node_modules\.bin\vitest.cmd run
.\node_modules\.bin\tsc.cmd --noEmit --project tsconfig.typecheck.json
.\node_modules\.bin\next.cmd build
git diff --check
```

如果新增了独立策略或API测试文件，必须在第一条针对性命令中一并列出。不得使用 `npx`。

UI改动还必须启动本地开发服务器，使用真实浏览器检查设置支付密码、结账、订单支付弹窗和提现页面。受登录限制无法自动进入时，应提供源码级证据并由胡子老师登录后截图验收。

## 10. 完成标准

1. 新设置和修改后的支付密码只能是恰好6位数字。
2. 支付、提现和旧密码验证只做非空检查加后端哈希比对。
3. 旧6位数字密码和存量字母数字密码均可继续验证。
4. 5次错误锁定15分钟机制及测试保持通过。
5. 不修改数据库结构和任何资金计算规则。
6. 针对性测试、全量测试、typecheck、build 和 `git diff --check` 全部通过。
7. 本地页面验证有真实证据；无法自动登录的限制被如实说明。
8. 小酷审核通过后，再由小M做独立只读P级复审。
9. 胡子老师验收并批准前，不得 commit、push 或部署业务实现。

## 11. 执行顺序与角色

1. 小猫按完整提示词执行TDD实现，不提交、不推送、不部署。
2. 胡子老师将小猫结构化结果回传小酷。
3. 小酷核对真实diff、测试、build、支付调用链和存量兼容证据。
4. 小酷审核通过后再准备小M独立只读复审提示词。
5. 胡子老师将小M结论回传小酷核验。
6. 胡子老师完成真实账号和页面验收，并单独批准提交与发布。
