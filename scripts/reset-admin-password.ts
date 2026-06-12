import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const phone = '13800138000'
  const plainPassword = '123456'

  const user = await prisma.user.findUnique({ where: { phone } })
  if (!user) {
    console.log(`未找到手机号为 ${phone} 的用户`)
    return
  }

  const passwordHash = await bcrypt.hash(plainPassword, 10)

  await prisma.user.update({
    where: { phone },
    data: { passwordHash },
  })

  console.log(`密码重置成功 - 手机号: ${phone}, 新密码: ${plainPassword}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
