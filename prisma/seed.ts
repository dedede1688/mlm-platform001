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
  ]

  for (const config of businessConfigs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: { value: config.value, description: config.description },
      create: config,
    })
  }

  console.log(`业务配置创建完成（${businessConfigs.length} 项）`)
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
