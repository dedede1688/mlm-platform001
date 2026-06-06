const { PrismaClient } = require('@prisma/client')
const { UserService } = require('./dist/lib/services/user.service')
const { OrderService } = require('./dist/lib/services/order.service')
const { RewardService } = require('./dist/lib/services/reward.service')
const { PointsService } = require('./dist/lib/services/points.service')
const { ProductService } = require('./dist/lib/services/product.service')
const { AdminService } = require('./dist/lib/services/admin.service')

const prisma = new PrismaClient()

async function testServices() {
  try {
    console.log('=== 测试多级分销电商平台服务 ===\n')

    // 1. 测试系统统计
    console.log('1. 获取系统统计信息...')
    const stats = await AdminService.getSystemStats()
    console.log('系统统计:', stats)

    // 2. 测试用户服务
    console.log('\n2. 测试用户服务...')
    const users = await AdminService.getUsers(1, 5)
    console.log(`获取用户列表: ${users.users.length} 个用户`)

    if (users.users.length > 0) {
      const userId = users.users[0].id
      const userDetail = await AdminService.getUserDetail(userId)
      console.log(`用户详情: ${userDetail.nickname || userDetail.phone}`)

      // 测试获取用户推荐人
      const referrals = await UserService.getReferrals(userId)
      console.log(`推荐人数量: ${referrals.length}`)

      // 测试获取用户团队
      const team = await UserService.getTeam(userId, 2)
      console.log(`团队人数: ${team.length}`)
    }

    // 3. 测试订单服务
    console.log('\n3. 测试订单服务...')
    const orders = await AdminService.getOrders(1, 5)
    console.log(`获取订单列表: ${orders.orders.length} 个订单`)

    // 4. 测试奖励服务
    console.log('\n4. 测试奖励服务...')
    const rewards = await AdminService.getRewards(1, 5)
    console.log(`获取奖励列表: ${rewards.rewards.length} 个奖励`)

    if (users.users.length > 0) {
      const userId = users.users[0].id
      const rewardStats = await RewardService.getUserRewardStats(userId)
      console.log(`用户奖励统计:`, rewardStats)
    }

    // 5. 测试积分服务
    console.log('\n5. 测试积分服务...')
    if (users.users.length > 0) {
      const userId = users.users[0].id
      const pointsStats = await PointsService.getUserPointsStats(userId)
      console.log(`用户积分统计:`, pointsStats)

      const pointsRecords = await PointsService.getUserPointsRecords(userId, 1, 5)
      console.log(`积分记录数量: ${pointsRecords.records.length}`)
    }

    // 6. 测试产品服务
    console.log('\n6. 测试产品服务...')
    const products = await ProductService.getAllProducts()
    console.log(`获取产品列表: ${products.length} 个产品`)

    if (products.length > 0) {
      const product = await ProductService.getProductById(products[0].id)
      console.log(`产品详情: ${product.name}`)
    }

    console.log('\n=== 所有服务测试完成 ===')
    
  } catch (error) {
    console.error('测试失败:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// 运行测试
testServices()