const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  // 对密码进行哈希加密
  const hash = await bcrypt.hash('123456', 10);
  
  // 更新数据库中手机号为 13800138000 的用户密码（使用正确的字段名 passwordHash）
  const user = await prisma.user.update({
    where: { phone: '13800138000' },
    data: { passwordHash: hash }   // ← 这里改成了 passwordHash
  });
  
  console.log(`密码已重置为 123456，用户：${user.phone}`);
}

main()
  .catch(e => {
    console.error('发生错误：', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());