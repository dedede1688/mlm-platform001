const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

p.user.findUnique({ where: { phone: '13800138000' } })
  .then(u => {
    console.log('用户存在:', !!u)
    if (u) {
      console.log('密码哈希前10位:', u.passwordHash?.substring(0, 10))
      console.log('角色:', u.role)
    }
  })
  .catch(e => console.error(e))
  .finally(() => p.$disconnect())
