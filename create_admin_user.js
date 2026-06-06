const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  try {
    // 创建超级管理员用户（董事级别）
    const phone = '13800138000';
    const password = '123456';
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = await prisma.user.create({
      data: {
        phone: phone,
        passwordHash: hashedPassword,
        nickname: '超级管理员',
        level: 7, // 董事级别
        balance: 10000,
        totalPoints: 1000,
        unlockedPoints: 500,
        lockedPoints: 500
      }
    });
    
    console.log('超级管理员创建成功:');
    console.log(`  手机号: ${user.phone}`);
    console.log(`  昵称: ${user.nickname}`);
    console.log(`  等级: ${user.level} (董事)`);
    console.log(`  余额: ¥${user.balance}`);
    
  } catch (error) {
    console.error('创建管理员失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);