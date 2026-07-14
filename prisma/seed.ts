import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('开始初始化数据库...')

  const products = [
    {
      name: '升级产品A',
      description: '用于升级为经销商的指定产品',
      retailPrice: 600,
      memberPrice: 500,
      stock: 1000,
      isUpgradeProduct: true,
      maxPointsRatio: 50,
      sortOrder: 1,
    },
    {
      name: '升级产品B',
      description: '用于升级为经销商的指定产品',
      retailPrice: 1200,
      memberPrice: 1000,
      stock: 1000,
      isUpgradeProduct: true,
      maxPointsRatio: 50,
      sortOrder: 2,
    },
    {
      name: '普通产品C',
      description: '普通消费产品',
      retailPrice: 300,
      memberPrice: 250,
      stock: 500,
      isUpgradeProduct: false,
      maxPointsRatio: 50,
      sortOrder: 3,
    },
    {
      name: '普通产品D',
      description: '普通消费产品',
      retailPrice: 600,
      memberPrice: 500,
      stock: 500,
      isUpgradeProduct: false,
      maxPointsRatio: 50,
      sortOrder: 4,
    },
    {
      name: '普通产品E',
      description: '普通消费产品',
      retailPrice: 900,
      memberPrice: 750,
      stock: 500,
      isUpgradeProduct: false,
      maxPointsRatio: 50,
      sortOrder: 5,
    },
  ]

  for (const product of products) {
    await prisma.product.upsert({
      where: { id: `seed-${product.name}` },
      update: product,
      create: { id: `seed-${product.name}`, ...product },
    })
  }

  console.log('默认商品创建完成')

  const businessConfigs = [
    { key: 'reward.referral_rate', value: '0.20', description: '直推奖比例' },
    { key: 'reward.brand_bonus_rate', value: '0.20', description: '品牌管理奖比例' },
    { key: 'dividend.director.rate', value: '0.05', description: '分红-主任池比例' },
    { key: 'dividend.manager.rate', value: '0.05', description: '分红-经理池比例' },
    { key: 'dividend.supervisor.rate', value: '0.05', description: '分红-总监池比例' },
    { key: 'dividend.president.rate', value: '0.05', description: '分红-总裁池比例' },
    { key: 'dividend.board.rate', value: '0.05', description: '分红-董事池比例' },
    { key: 'dividend.director.include_upstream', value: 'false', description: '主任池"包含上级"开关' },
    { key: 'dividend.manager.include_upstream', value: 'false', description: '经理池"包含上级"开关' },
    { key: 'dividend.supervisor.include_upstream', value: 'false', description: '总监池"包含上级"开关' },
    { key: 'dividend.president.include_upstream', value: 'false', description: '总裁池"包含上级"开关' },
    { key: 'dividend.board.include_upstream', value: 'false', description: '董事池"包含上级"开关' },
    { key: 'upgrade.distributor.box_count', value: '10', description: '经销商升级门槛（箱数）' },
    { key: 'upgrade.points_per_box', value: '500', description: '经销商升级积分/箱' },
    { key: 'upgrade.daily_unlock_rate', value: '0.01', description: '积分每天释放比例' },
    { key: 'upgrade.director.sales_amount', value: '50000', description: '主任升级销售额' },
    { key: 'upgrade.manager.sales_amount', value: '100000', description: '经理升级销售额' },
    { key: 'upgrade.supervisor.sales_amount', value: '200000', description: '总监升级销售额' },
    { key: 'upgrade.president.sales_amount', value: '500000', description: '总裁升级销售额' },
    { key: 'upgrade.board.sales_amount', value: '1000000', description: '董事升级销售额' },
    { key: 'feature.points_transfer_enabled', value: 'true', description: '积分转赠功能开关' },
    { key: 'points.transfer_fee_percent', value: '10', description: '积分转赠手续费（%）' },
    { key: 'withdrawal.min_amount', value: '100', description: '最低提现金额（元）' },
    { key: 'withdrawal.max_amount', value: '50000', description: '单笔最高提现金额（元）' },
    { key: 'withdrawal.daily_limit', value: '3', description: '每日提现次数上限' },
    { key: 'withdrawal.fee_percent', value: '0', description: '提现手续费（%）' },
  ]

  for (const config of businessConfigs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: { value: config.value, description: config.description },
      create: config,
    })
  }

  console.log(`业务配置创建完成（${businessConfigs.length} 项）`)

  // ---- 通知模板种子 ----
  const notificationTemplates = [
    {
      id: 'seed-tpl-order_paid-in_app',
      type: 'order_paid',
      channel: 'in_app',
      subject: '订单支付成功',
      content: '【敏维科技】您的订单 {{orderNo}} 已支付成功，实付金额 ¥{{payAmount}}，我们会尽快为您发货。',
      enabled: true,
    },
    {
      id: 'seed-tpl-order_shipped-in_app',
      type: 'order_shipped',
      channel: 'in_app',
      subject: '订单已发货',
      content: '【敏维科技】您的订单 {{orderNo}} 已发货，物流单号 {{trackingNumber}}，请注意查收。',
      enabled: true,
    },
    {
      id: 'seed-tpl-order_completed-in_app',
      type: 'order_completed',
      channel: 'in_app',
      subject: '订单已完成',
      content: '【敏维科技】您的订单 {{orderNo}} 已完成，感谢您的支持，欢迎再次光临。',
      enabled: true,
    },
    {
      id: 'seed-tpl-order_cancelled-in_app',
      type: 'order_cancelled',
      channel: 'in_app',
      subject: '订单已取消',
      content: '【敏维科技】您的订单 {{orderNo}} 已取消，原因：{{reason}}。如有疑问请联系客服。',
      enabled: true,
    },
    {
      id: 'seed-tpl-register_verify-in_app',
      type: 'register_verify',
      channel: 'in_app',
      subject: '注册验证码',
      content: '【敏维科技】您的注册验证码是 {{verifyCode}}，{{expireMinutes}} 分钟内有效，请勿泄露给他人。',
      enabled: true,
    },
    {
      id: 'seed-tpl-password_reset-in_app',
      type: 'password_reset',
      channel: 'in_app',
      subject: '密码重置',
      content: '【敏维科技】{{userName}} 您好，您正在重置密码，点击链接完成重置：{{resetLink}}，{{expireMinutes}} 分钟内有效。',
      enabled: true,
    },
    {
      id: 'seed-tpl-withdrawal_result-in_app',
      type: 'withdrawal_result',
      channel: 'in_app',
      subject: '提现审核结果',
      content: '【敏维科技】{{userName}} 您好，您的提现申请 ¥{{amount}} 已审核{{status}}。{{reason}}',
      enabled: true,
    },
    {
      id: 'seed-tpl-refund_submitted-in_app',
      type: 'refund_submitted',
      channel: 'in_app',
      subject: '退款申请已提交',
      content: '【敏维科技】{{userName}} 您好，您的订单 {{orderNo}} 退款申请已提交，金额 ¥{{amount}}，等待管理员审核。',
      enabled: true,
    },
    {
      id: 'seed-tpl-user_status_change-in_app',
      type: 'user_status_change',
      channel: 'in_app',
      subject: '账户状态变更通知',
      content: '【敏维科技】{{userName}} 您好，您的账户已被{{statusLabel}}，原因：{{reason}}。如有疑问请联系客服。',
      enabled: true,
    },
    {
      id: 'seed-tpl-points_void-in_app',
      type: 'points_void',
      channel: 'in_app',
      subject: '积分作废通知',
      content: '【敏维科技】{{userName}} 您好，您的 {{amount}} 积分已被作废，原因：{{reason}}。当前可用积分：{{remainingPoints}}。如有疑问请联系客服。',
      enabled: true,
    },
    {
      id: 'seed-tpl-manual_reward-in_app',
      type: 'manual_reward',
      channel: 'in_app',
      subject: '手动奖励到账通知',
      content: '【敏维科技】{{userName}} 您好，您收到一笔手动奖励 ¥{{amount}}，原因：{{reason}}。如有疑问请联系客服。',
      enabled: true,
    },
    {
      id: 'seed-tpl-recharge_approved-in_app',
      type: 'recharge_approved',
      channel: 'in_app',
      subject: '充值审核通过通知',
      content: '【敏维科技】{{userName}} 您好，您的充值申请 ¥{{amount}} 已审核通过，余额已入账。当前可用余额：¥{{newBalance}}。如有疑问请联系客服。',
      enabled: true,
    },
    {
      id: 'seed-tpl-recharge_submitted-in_app',
      type: 'recharge_submitted',
      channel: 'in_app',
      subject: '充值申请已提交',
      content: '【敏维科技】{{userName}} 您好，您的充值申请 ¥{{amount}} 已提交成功，平台会尽快审核。请留意审核结果通知。',
      enabled: true,
    },
    {
      id: 'seed-tpl-payment_password_reset-in_app',
      type: 'payment_password_reset',
      channel: 'in_app',
      subject: '支付密码重置通知',
      content: '【敏维科技】{{userName}} 您好，您的支付密码已被管理员重置。请尽快前往个人中心设置新的支付密码，以确保账户安全。',
      enabled: true,
    },
    {
      id: 'seed-tpl-recharge_rejected-in_app',
      type: 'recharge_rejected',
      channel: 'in_app',
      subject: '充值审核拒绝通知',
      content: '【敏维科技】{{userName}} 您好，您的充值申请 ¥{{amount}} 已被拒绝，原因：{{rejectReason}}。如有疑问请联系客服。',
      enabled: true,
    },
    {
      id: 'seed-tpl-earnings_voided-in_app',
      type: 'earnings_voided',
      channel: 'in_app',
      subject: '收益作废通知',
      content: '【敏维科技】{{userName}} 您好，您的可用收益 ¥{{amount}} 已被后台作废。剩余可用收益：¥{{earningsAvailable}}，累计作废收益：¥{{earningsVoided}}。如有疑问请联系客服。',
      enabled: true,
    },
    {
      id: 'seed-tpl-earnings_transferred-in_app',
      type: 'earnings_transferred',
      channel: 'in_app',
      subject: '收益转入购物余额通知',
      content: '【敏维科技】{{userName}} 您好，您的收益 ¥{{amount}} 已成功转入购物余额，当前购物余额 ¥{{balance}}，剩余可用收益 ¥{{earningsAvailable}}。',
      enabled: true,
    },
    {
      id: 'seed-tpl-general-in_app',
      type: 'general',
      channel: 'in_app',
      subject: '通用通知',
      content: '【敏维科技】{{userName}} 您好，{{content}}',
      enabled: true,
    },
    {
      id: 'seed-tpl-announcement-in_app',
      type: 'announcement',
      channel: 'in_app',
      subject: '系统公告',
      content: '【敏维科技】系统公告：{{content}}',
      enabled: true,
    },
  ]

  for (const tpl of notificationTemplates) {
    await prisma.notificationTemplate.upsert({
      where: { type_channel: { type: tpl.type, channel: tpl.channel } },
      update: { content: tpl.content, subject: tpl.subject, enabled: tpl.enabled },
      create: tpl,
    })
  }

  console.log(`通知模板创建完成（${notificationTemplates.length} 个站内信模板）`)
  console.log('数据库初始化完成！')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
