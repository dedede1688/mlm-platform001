# 多级分销电商平台

[![Coverage](https://img.shields.io/badge/coverage-71.85%25-brightgreen)](https://github.com/dedede1688/mlm-platform001)
[![Tests](https://img.shields.io/badge/tests-87%20passed-brightgreen)](https://github.com/dedede1688/mlm-platform001)

一个基于 Next.js + Prisma + Supabase 的多级分销电商平台，采用三三复制模式。

## 核心功能

### 会员系统
- 8级会员体系：游客 → 会员 → 经销商 → 主任 → 经理 → 总监 → 总裁 → 董事
- 双轨关系：直推关系（永久绑定）+ 安置关系（三三复制滑落）

### 奖励系统

- **推荐奖（20%）**：直推人消费金额的20%
- **品牌管理奖（20%）**：安置链下级的20%，按直推经销商数解锁层级
- **分红奖（5%）**：主任及以上级别享受平台分红

### 积分系统

- 购买升级产品获得积分
- 每日解锁1%，100天释放完毕
- 积分可转赠、可购物抵扣

### 订单系统

- 模拟支付（测试环境）
- 支持积分抵扣
- 完整的订单流程：待支付 → 已支付 → 已发货 → 已完成

## 技术栈

- **前端**：Next.js 15 + React 19 + TypeScript + Tailwind CSS
- **后端**：Next.js API Routes
- **数据库**：PostgreSQL + Prisma ORM
- **认证**：JWT
- **部署**：Vercel

## 项目结构

```
mlm-platform/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API 路由
│   │   │   ├── auth/          # 认证相关
│   │   │   ├── products/      # 商品相关
│   │   │   ├── orders/        # 订单相关
│   │   │   ├── users/         # 用户相关
│   │   │   ├── rewards/       # 奖励相关
│   │   │   └── withdrawals/   # 提现相关
│   │   ├── page.tsx           # 首页
│   │   ├── login/             # 登录页
│   │   ├── register/          # 注册页
│   │   ├── products/          # 商品列表
│   │   └── dashboard/         # 用户仪表盘
│   ├── components/            # 组件
│   ├── lib/                   # 工具库
│   │   ├── prisma.ts          # Prisma 客户端
│   │   ├── constants.ts       # 常量定义
│   │   ├── utils/             # 工具函数
│   │   └── services/          # 业务服务
│   └── types/                 # 类型定义
├── prisma/
│   ├── schema.prisma          # 数据库模型
│   └── seed.ts                # 种子数据
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.js
```

## 数据库模型

### 核心表

- **users**：用户表（包含推荐关系和安置关系）
- **products**：商品表
- **orders**：订单表
- **order_items**：订单商品表
- **rewards**：奖励记录表
- **dividends**：分红记录表
- **points_records**：积分记录表
- **withdrawals**：提现记录表

## 安装和运行

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量

复制 `.env.local` 并配置：
```bash
DATABASE_URL="postgresql://user:password@localhost:5432/mlm_platform"
JWT_SECRET="your-jwt-secret"
```

### 3. 初始化数据库

```bash
npx prisma migrate dev
npm run db:seed
```

### 4. 生成 Prisma Client
```bash
npx prisma generate
```

### 5. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

## 部署到 Vercel

### 1. 创建 Vercel 项目
```bash
vercel
```

### 2. 配置环境变量
在 Vercel Dashboard 中配置：
- `DATABASE_URL`：PostgreSQL 连接字符串
- `JWT_SECRET`：JWT 密钥

### 3. 部署
```bash
vercel --prod
```

## API 文档

### 认证
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录

### 商品
- `GET /api/products` - 获取商品列表
- `POST /api/products` - 创建商品（管理员）
- `GET /api/products/[id]` - 获取商品详情
- `PUT /api/products/[id]` - 更新商品
- `DELETE /api/products/[id]` - 删除商品

### 订单
- `GET /api/orders` - 获取订单列表
- `POST /api/orders` - 创建订单
- `GET /api/orders/[id]` - 获取订单详情
- `POST /api/orders/[id]` - 支付订单
- `PUT /api/orders/[id]` - 确认收货
- `DELETE /api/orders/[id]` - 取消订单

### 用户
- `GET /api/users/me` - 获取当前用户信息
- `PUT /api/users/me` - 更新用户信息

### 奖励
- `GET /api/rewards` - 获取奖励记录
- `POST /api/rewards` - 获取奖励统计

### 提现
- `GET /api/withdrawals` - 获取提现记录
- `POST /api/withdrawals` - 创建提现申请

## 核心算法

### 三三复制安置算法
```typescript
// 从上到下，从左到右查找空位
async function findPlacementPosition(referrerId: string) {
  const queue = [referrerId]
  
  while (queue.length > 0) {
    const currentId = queue.shift()
    const children = await getChildren(currentId)
    
    // 查找空位
    for (let pos = 1; pos <= 3; pos++) {
      if (!children.find(c => c.position === pos)) {
        return { parentId: currentId, position: pos }
      }
    }
    
    // 当前节点已满，将子节点加入队列
    queue.push(...children.map(c => c.id))
  }
}
```

### 品牌管理奖计算

```typescript
// 向上轮询安置链，找到最近的经销商
async function createBrandBonusRewards(buyerId, orderId, orderAmount) {
  const placementChain = await getPlacementChain(buyerId, 10)
  const maxLevels = getMaxLevels(directDistributorCount)
  
  let currentLevel = 0
  for (const userId of placementChain) {
    if (currentLevel >= maxLevels) break
    
    const user = await getUser(userId)
    if (user.level >= DISTRIBUTOR_LEVEL) {
      await createReward(userId, orderAmount * 0.20)
      currentLevel++
    }
  }
}
```

## 注意事项

1. **合规性**：多级分销模式需遵守当地法律法规
2. **测试环境**：当前使用模拟支付，生产环境需接入真实支付
3. **安全性**：生产环境请使用 HTTPS 和更强的 JWT 密钥
4. **性能**：大数据量时请考虑添加缓存和数据库索引优化

## 许可证

MIT

<!-- test-deploy-preview v45.6: 验证 Vercel deploy preview -->
