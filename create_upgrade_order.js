const { PrismaClient } = require('@prisma/client');

async function createUpgradeOrder() {
  const prisma = new PrismaClient();
  
  try {
    console.log('为用户A创建升级产品订单...');
    
    // 获取用户A
    const userA = await prisma.user.findUnique({
      where: { phone: '13811111111' }
    });

    // 获取升级产品
    const upgradeProduct = await prisma.product.findFirst({
      where: { isUpgradeProduct: true }
    });

    if (!upgradeProduct) {
      console.log('未找到升级产品');
      return;
    }

    console.log('找到升级产品:', upgradeProduct.name);

    // 创建9个升级产品订单（用户A已有1个，总共需要10个）
    for (let i = 0; i < 9; i++) {
      const orderNo = `ORD${Date.now()}${i}`;
      
      const order = await prisma.order.create({
        data: {
          userId: userA.id,
          orderNo,
          totalAmount: upgradeProduct.memberPrice,
          payAmount: upgradeProduct.memberPrice,
          status: 'paid',
          paidAt: new Date(),
          items: {
            create: [
              {
                productId: upgradeProduct.id,
                quantity: 1,
                unitPrice: upgradeProduct.memberPrice,
                totalPrice: upgradeProduct.memberPrice
              }
            ]
          }
        }
      });

      console.log(`创建订单: ${orderNo}`);
    }

    // 更新用户A的升级产品计数
    await prisma.user.update({
      where: { id: userA.id },
      data: { 
        upgradeProductCount: 10,
        level: 2
      }
    });

    console.log('用户A已升级为经销商！');

  } catch (error) {
    console.error('错误:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createUpgradeOrder();