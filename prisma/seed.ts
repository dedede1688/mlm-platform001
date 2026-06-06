import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('开始初始化数据库...')

  // 创建默认商品
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
    await prisma.product.create({
      data: product,
    })
  }

  console.log('默认商品创建完成')

  // 创建系统配置
  const configs = [
    { key: 'referral_bonus_rate', value: '0.20', description: '推荐奖比例' },
    { key: 'brand_bonus_rate', value: '0.20', description: '品牌管理奖比例' },
    { key: 'dividend_rate', value: '0.05', description: '分红比例' },
    { key: 'points_unlock_rate', value: '0.01', description: '每日解锁比例' },
    { key: 'points_unlock_days', value: '100', description: '解锁天数' },
    { key: 'upgrade_product_threshold', value: '10', description: '升级产品购买数量' },
  ]

  for (const config of configs) {
    await prisma.systemConfig.create({
      data: config,
    })
  }

  console.log('系统配置创建完成')
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
