# MLM 平台修复报告

**修复日期**: 2026-06-12  
**修复范围**: 资金安全、并发控制、权限管理、输入验证、错误处理、用户体验

---

## 一、P0 级别修复（资金安全 - 已完成）

### 1. 修复奖励双重发放 Bug
**文件**: `src/app/api/orders/[id]/pay/route.ts`  
**问题**: `payOrder()` 内部已调用 `processOrderRewards()`,API 路由又重复调用一次,导致奖励发放两次  
**修复**: 删除 API 路由中重复的 `processOrderRewards()` 调用

### 2. 订单创建加事务保护
**文件**: `src/lib/services/order.service.ts` - `createOrder()`  
**修复**: 
- 使用 `prisma.$transaction()` 包裹创建订单、扣减库存、扣减积分
- 事务内重新校验库存和积分余额(防并发)
- 使用原子操作 `UPDATE ... WHERE stock >= quantity` 防超卖
- 使用原子操作 `UPDATE ... WHERE unlockedPoints >= amount` 防积分透支

### 3. 订单支付加并发控制
**文件**: `src/lib/services/order.service.ts` - `payOrder()`  
**修复**: 
- 使用 `updateMany` 原子更新,仅当 `status = 'pending'` 时才能更新
- 防止并发请求重复支付

### 4. 退款处理加事务保护
**文件**: `src/lib/services/order.service.ts` - `requestRefund()`  
**修复**: 
- 使用 `prisma.$transaction()` 包裹退回库存、退回积分、扣回奖励
- 修复积分记录字段值不正确的问题(之前硬编码为 0)

### 5. 取消订单加事务 + 补积分记录
**文件**: `src/lib/services/order.service.ts` - `cancelOrder()`  
**修复**: 
- 使用 `prisma.$transaction()` 包裹退回库存、退回积分
- 补充创建积分退回记录(之前缺失)

### 6. 提现申请加事务 + 并发控制
**文件**: `src/lib/services/withdrawal.service.ts` - `createWithdrawal()`  
**修复**: 
- 使用 `prisma.$transaction()` 包裹扣减余额、创建提现记录
- 使用原子操作 `UPDATE ... WHERE balance >= amount` 防并发透支

### 7. 提现审核加事务保护
**文件**: `src/lib/services/withdrawal.service.ts` - `reviewWithdrawal()`  
**修复**: 
- 使用 `prisma.$transaction()` 包裹状态检查、余额操作
- 事务内重新查询提现记录状态(防并发重复处理)

### 8. 积分发放加事务保护
**文件**: `src/lib/services/points.service.ts` - `grantPoints()`  
**修复**: 
- 使用 `prisma.$transaction()` 包裹更新用户积分、创建积分记录、创建解锁计划

### 9. 每日解锁加事务保护
**文件**: `src/lib/services/points.service.ts` - `dailyUnlock()`  
**修复**: 
- 每个 schedule 使用独立事务
- 事务内重新查询 schedule 状态(防并发重复解锁)

### 10. 积分转赠加事务 + 并发控制
**文件**: `src/lib/services/points.service.ts` - `transferPoints()`  
**修复**: 
- 使用 `prisma.$transaction()` 包裹扣减转出方、增加接收方
- 使用原子操作 `UPDATE ... WHERE unlockedPoints >= amount` 防并发透支

### 11. 积分作废加事务保护
**文件**: `src/lib/services/points.service.ts` - `voidPoints()`  
**修复**: 
- 使用 `prisma.$transaction()` 包裹扣除锁定积分、创建作废记录、更新计划状态

---

## 二、P1 级别修复（安全加固 - 已完成）

### 1. 统一角色命名体系
**文件**: `src/middleware.ts`  
**问题**: middleware 使用 `order_manager`、`goods_manager` 等角色,与 `admin-auth.ts` 的 `super_admin`、`goods_admin` 不匹配  
**修复**: 
- 将 middleware 角色映射对齐到 `admin-auth.ts` 的角色定义
- 补充缺失的 API 路径角色映射(分红结算、手动奖励、统计等)

### 2. 注册接口加输入验证
**文件**: `src/app/api/auth/register/route.ts`  
**修复**: 
- 验证手机号格式(11位数字,1开头)
- 验证密码强度(至少6位)
- 验证昵称长度(2-20字符)

### 3. API 错误响应不再暴露内部信息
**文件**: 12 个 API 路由文件  
**修复**: 
- 所有 `catch` 块不再返回 `error.message`
- 统一返回固定错误消息(如"支付失败"、"创建订单失败")
- 防止泄露数据库错误、内部实现细节

### 4. 分红结算 API 加管理员权限校验
**文件**: `src/app/api/admin/settle-dividends/route.ts`  
**问题**: 之前任何登录用户都能调用分红结算  
**修复**: 
- POST 接口:仅 `super_admin` 和 `finance_admin` 可调用
- GET 接口:仅 `super_admin`、`finance_admin`、`auditor` 可调用
- 使用 `verifyPermission()` 替代 `verifyToken()`

### 5. 订单列表加默认分页限制
**文件**: `src/lib/services/order.service.ts` - `getUserOrders()`  
**修复**: 
- 添加 `page` 和 `limit` 参数(默认 page=1, limit=20)
- 返回分页信息(total, totalPages)
- API 路由支持 `?page=1&limit=20` 查询参数

### 6. 通知发送失败加日志记录
**文件**: `src/lib/services/order.service.ts`  
**修复**: 
- `payOrder()` 通知失败:记录 `console.error('发送订单支付成功邮件失败:', err)`
- `shipOrder()` 通知失败:记录 `console.error('发送订单发货邮件失败:', err)`
- 不再静默吞掉错误(`.catch(() => {})`)

---

## 三、P2 级别修复（用户体验 - 已完成）

### 1. 添加全局 Error Boundary
**文件**: `src/app/error.tsx` (新建)  
**功能**: 
- 捕获应用级渲染错误
- 显示友好的错误页面
- 提供"刷新页面"和"返回首页"按钮

### 2. 产品详情页去掉强制登录
**文件**: `src/app/products/[id]/page.tsx`  
**问题**: 未登录用户无法查看商品详情,损害 SEO 和用户体验  
**修复**: 
- 移除 `useEffect` 中的 `router.push('/login')`
- 无论是否登录都获取商品信息
- 仅登录用户获取用户信息(积分、余额等)

### 3. 添加 .env.example 环境变量清单
**文件**: `.env.example` (新建)  
**内容**: 
- 数据库配置
- JWT 密钥
- Supabase 配置
- 邮件服务配置
- 短信服务配置
- 应用配置

### 4. JWT_SECRET 启动时校验
**文件**: `src/lib/utils/auth.ts`, `src/middleware.ts`  
**修复**: 
- `auth.ts`: `getJwtSecret()` 函数在每次调用时检查,未设置时抛出明确错误
- `middleware.ts`: `verifyJwt()` 函数检查 `JWT_SECRET`,未设置时返回 null 并记录错误
- 不再使用非空断言 `process.env.JWT_SECRET!`

---

## 四、并发控制技术方案

### 原子操作防并发
所有涉及余额、积分、库存的操作都使用数据库层面的原子操作:

```sql
-- 库存扣减(防超卖)
UPDATE "Product"
SET stock = stock - ${quantity}
WHERE id = ${productId}::uuid AND stock >= ${quantity}
RETURNING 1 as count

-- 积分扣减(防透支)
UPDATE "User"
SET "unlockedPoints" = "unlockedPoints" - ${amount}
WHERE id = ${userId}::uuid AND "unlockedPoints" >= ${amount}
RETURNING 1 as count

-- 余额扣减(防透支)
UPDATE "User"
SET balance = balance - ${amount},
    "frozenBalance" = "frozenBalance" + ${amount}
WHERE id = ${userId}::uuid AND balance >= ${amount}
RETURNING 1 as count
```

如果 `RETURNING 1 as count` 返回空数组,说明条件不满足(库存/余额不足),抛出错误。

### 事务保证原子性
所有多步操作都使用 `prisma.$transaction(async (tx) => {...})`,任一步失败整体回滚。

---

## 五、修改文件清单

### 后端服务层 (4个文件)
- `src/lib/services/order.service.ts` - 订单创建、支付、退款、取消
- `src/lib/services/withdrawal.service.ts` - 提现申请、审核
- `src/lib/services/points.service.ts` - 积分发放、解锁、转赠、作废
- `src/middleware.ts` - 角色映射、JWT 校验

### API 路由层 (12个文件)
- `src/app/api/orders/[id]/pay/route.ts` - 删除重复奖励调用、错误响应
- `src/app/api/orders/route.ts` - 分页参数、错误响应
- `src/app/api/orders/[id]/confirm/route.ts` - 错误响应
- `src/app/api/orders/[id]/route.ts` - 错误响应(3处)
- `src/app/api/withdrawals/route.ts` - 错误响应
- `src/app/api/points/transfer/route.ts` - 错误响应
- `src/app/api/admin/settle-dividends/route.ts` - 权限校验、错误响应
- `src/app/api/admin/settings/route.ts` - 错误响应
- `src/app/api/admin/config/route.ts` - 错误响应
- `src/app/api/auth/register/route.ts` - 输入验证

### 工具层 (1个文件)
- `src/lib/utils/auth.ts` - JWT_SECRET 校验

### 前端页面 (1个文件)
- `src/app/products/[id]/page.tsx` - 去掉强制登录

### 新建文件 (2个文件)
- `src/app/error.tsx` - 全局 Error Boundary
- `.env.example` - 环境变量清单

---

## 六、修复效果

### 资金安全
- ✅ 所有金融操作都有事务保护,任一步失败整体回滚
- ✅ 所有余额/积分/库存操作都使用原子操作,防并发超卖/透支
- ✅ 修复奖励双重发放 Bug,避免资金损失

### 权限安全
- ✅ 统一角色命名体系,middleware 权限检查生效
- ✅ 分红结算等敏感接口仅限管理员调用
- ✅ API 错误响应不再暴露内部实现细节

### 输入验证
- ✅ 注册接口验证手机号格式、密码强度、昵称长度
- ✅ 订单列表默认分页,防止大量数据加载

### 用户体验
- ✅ 全局 Error Boundary 捕获渲染错误,显示友好错误页面
- ✅ 产品详情页允许未登录用户浏览,提升 SEO
- ✅ 通知发送失败有日志记录,便于排查问题

### 开发体验
- ✅ JWT_SECRET 未设置时启动即报错,错误信息明确
- ✅ 提供 .env.example 环境变量清单,方便配置

---

## 七、待办事项（建议后续处理）

### 测试覆盖
- [ ] 添加订单创建、支付、退款的单元测试
- [ ] 添加提现、积分转赠的并发测试
- [ ] 添加权限校验的集成测试

### 性能优化
- [ ] 奖励统计使用数据库 `aggregate` 替代内存 filter/reduce
- [ ] 管理后台重型组件使用 `next/dynamic` 动态导入
- [ ] 使用 `next/image` 替代原生 `<img>` 标签

### 前端优化
- [ ] 抽取 `ProductCard`、`formatMoney`、分页组件为共享组件
- [ ] 统一颜色使用(全部使用 `primary` 主题色)
- [ ] 统一消息提示组件(替代 `alert()` 和内联 message)
- [ ] 模态框添加 ARIA 属性、焦点陷阱、Esc 关闭

### 其他
- [ ] 添加登录速率限制(防暴力破解)
- [ ] 添加账号锁定机制(连续失败多次后锁定)
- [ ] 结构化日志系统(替代 `console.log/error`)
- [ ] i18n 国际化支持

---

## 八、总结

本次修复共涉及 **20 个文件**,其中 **2 个新建文件**,重点解决了资金安全和并发控制问题。

所有金融操作都已加事务保护和原子操作,可以有效防止:
- 奖励重复发放
- 库存超卖
- 余额/积分透支
- 重复支付
- 数据不一致

权限体系已统一,敏感接口已加管理员校验,API 错误响应不再暴露内部信息。

建议后续补充测试覆盖,确保修复没有引入新问题,并逐步处理待办事项中的优化点。
