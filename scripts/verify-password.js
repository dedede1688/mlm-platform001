const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const p = new PrismaClient()

async function main() {
  const plainPassword = '123456'

  const newHash = await bcrypt.hash(plainPassword, 10)

  const user = await p.user.findUnique({ where: { phone: '13800138000' } })
  if (!user) {
    console.log('未找到用户')
    return
  }

  const storedHash = user.passwordHash
  const match = await bcrypt.compare(plainPassword, storedHash)

  console.log('新生成的哈希前20位:', newHash.substring(0, 20))
  console.log('数据库中的哈希前20位:', storedHash.substring(0, 20))
  console.log('bcrypt.compare 结果:', match)
}

main()
  .catch(e => console.error(e))
  .finally(() => p.$disconnect())
