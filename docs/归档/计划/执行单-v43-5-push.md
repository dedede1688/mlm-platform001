# 执行单 v43-5：收货地址管理 commit + push

> 接收人：猫爪
> 派单人：mavis
> 发起人：胡子哥（2026-06-20 00:01）
> 角色：你只跑 git 命令，**不要改任何代码**

---

## 1. 任务范围

把 v43-5（地址管理）从本地工作区提交到 `origin/main`，触发 Vercel 自动部署。

**已完成 + build 验证（mavis 这边做的）：**
- 数据库：Address 模型 + 手写 SQL 迁移（`prisma/migrations/20260619230000_add_addresses_table/`）
- 数据层：省市区三级数据 + 访问工具（`src/lib/data/`）
- API：5 个新路由（`/api/regions`、`/api/user/addresses`、`/api/user/addresses/[id]`）
- 前端：地址管理页 + 2 个组件 + Dashboard 入口 + CheckoutDialog 集成
- Build：exit code 0，所有路由编译成功

---

## 2. 强制文件清单（用这个 add，**不要 `git add .`**）

```bash
# 修改文件
git add prisma/schema.prisma
git add src/app/cart/page.tsx
git add src/app/dashboard/page.tsx
git add src/components/checkout/CheckoutDialog.tsx

# 新增文件
git add prisma/migrations/20260619230000_add_addresses_table/migration.sql
git add src/app/api/regions/route.ts
git add src/app/api/user/addresses/route.ts
git add 'src/app/api/user/addresses/[id]/route.ts'
git add src/app/dashboard/addresses/page.tsx
git add src/components/address/AddressPicker.tsx
git add src/components/address/AddressForm.tsx
git add src/lib/data/china-regions.ts
git add src/lib/data/pca-code.json
```

> ⚠️ **不要 add**：`.mavis/`、`scripts/v3*`、`scripts/v4*`、`build-*.txt`、`push-log.txt`、其他 v37/v38/v39 临时文件

---

## 3. 提交 + 推送

```bash
git commit -m "feat: 收货地址管理（v43-5：Address 模型 + 4 API + 省市区三级联动 + CheckoutDialog 集成）

- 新增 Address 模型（userId/recipientName/phone/province/city/district/detailAddress/isDefault）
- 新增 4 个地址 API（GET/POST/PUT/DELETE），事务保证默认地址唯一
- 新增 /api/regions 返回完整省市区三级数据（airylan/china-area-data, WTFPL）
- 新增地址管理页 /dashboard/addresses（卡片列表 + 增删改 + 设默认）
- 新增 AddressPicker / AddressForm 公共组件
- CheckoutDialog 集成：地址选择器 + 下单成功自动保存
- Dashboard 加快捷入口
- 手写 SQL 迁移 20260619230000_add_addresses_table"

git push origin main
```

---

## 4. 🔒 铁律 1 强制验证（必跑，不要跳过）

`git push` 可能**静默失败**（v6 真实事故：本地 commit 有，但 origin/main 没更新）。push 完**必须立刻**：

```bash
git log origin/main --oneline -1
```

**验证标准**：
- 输出第一条 commit hash 必须等于你刚 push 的 commit
- `git status` 必须显示 `Your branch is up to date with 'origin/main'`

**如果不一致**：
- 说明 push 失败（最常见原因：网络中断、auth 失败、hook 阻塞）
- **不要重新 add/commit**——commit 已经有了
- 重试 push：`git push origin main`（最多 2 次）
- 还失败 → 报告 mavis，等胡子哥决定

---

## 5. Vercel 部署验证

1. 打开 https://vercel.com/dashboard → `mlm-platform001` → Deployments
2. 最新部署的 commit hash 必须等于你刚 push 的 commit
3. Status 必须是 **Ready**（绿点），不是 Building/Error
4. 如果超过 3 分钟还没 Ready → 报告 mavis

---

## 6. 给胡子哥的测试指引

部署成功后告诉胡子哥：

> **v43-5 已部署**，commit `<hash>`, Vercel Ready
> 强刷浏览器测试：
> 1. `/dashboard/addresses` — 新增/编辑/删除/设默认
> 2. `/cart` 点立即购买 → CheckoutDialog 顶部"选择收货地址"下拉
> 3. 选"+ 使用新地址"+ 勾选"保存到地址簿" → 下单 → 跳订单详情
> 4. 回 `/dashboard/addresses` 看新地址是否保存
> 5. 数据库 `addresses` 表能查到记录（Vercel → Supabase 验证）

---

## 7. 失败回滚预案

如果 Vercel 部署后胡子哥测试发现严重 bug：
- **不要**自己改代码
- `git revert HEAD --no-edit` → `git push origin main` → 等 mavis 评估修复方案

---

## 8. 报告格式

完成后回复 mavis，包含：
```
✅ v43-5 推送完成
- commit: <hash>
- origin/main: git log origin/main --oneline -1 的完整输出
- Vercel: <Ready 状态 + 部署 URL>
- 测试指引: 已发给胡子哥
```

如果失败，**必须**报告：
- 卡在哪一步
- 错误完整输出
- 已经试过几次