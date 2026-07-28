# Session 认证回归修复实施计划

> 级别：P1（权限判断与登录态）
>
> 前置：订单/退款状态机 P0 修复已完成并通过定向回归。

## 目标

修复认证存储由 `localStorage` 迁移到 `sessionStorage` 后遗留的读取不一致：

- 已登录用户进入商品详情后，点击购买不再因用户资料尚未加载而误跳登录页。
- 退款审核、财务审核、订单发货等按钮按当前登录角色正确启用。
- 只有服务端明确返回 `401` 时才清除登录态并跳转登录页。
- 退出与失效清理统一走认证工具，不再删除无效的旧存储键。

## Task 1：锁定认证决策规则

**新增文件**

- `__tests__/utils/session-auth-regression.test.ts`
- `src/app/products/[id]/product-auth-state.ts`

**修改文件**

- `src/lib/utils/auth-token.ts`

**测试要求**

- 角色只从 `getAuthUser()` 对应的会话存储读取。
- 商品用户资料加载中时返回 `wait`，不得返回 `redirect-login`。
- 仅无 token 或明确 `401` 返回 `redirect-login`。
- `403`、`500`、网络失败属于可重试错误，不清除登录态。

## Task 2：统一后台角色读取

**修改文件**

- `src/app/admin/orders/page.tsx`
- `src/app/admin/refunds/page.tsx`
- `src/app/admin/finance/page.tsx`
- `src/app/admin/products/page.tsx`
- `src/app/admin/users/page.tsx`

**实现要求**

- 全部改用 `getAuthUserRole()`。
- 删除页面内直接读取 `localStorage.getItem('user')` 的逻辑。
- 不改变现有权限矩阵和按钮业务条件。

## Task 3：修复商品购买认证竞态

**修改文件**

- `src/app/products/[id]/page.tsx`

**实现要求**

- token 存在时先进入用户资料 `loading` 状态。
- 资料加载完成后才能打开购买弹窗。
- 加载中禁用“立即购买”，显示“登录校验中...”。
- `/api/users/me` 明确返回 `401` 时清理会话并跳转登录。
- 其他失败保留 token，展示可重试提示，不误跳登录。

## Task 4：清理旧退出入口并验证

**修改文件**

- `src/app/dashboard/page.tsx`
- `src/app/cart/page.tsx`

**验证**

1. 定向认证测试全绿。
2. 订单/退款 P0 回归测试全绿。
3. `tsc --noEmit` 0 错误。
4. 全量测试与生产 build 0 错误。
5. 本地真实浏览器验证商品页与后台按钮；若受登录拦截，则由胡子老师在预览环境登录验收。
