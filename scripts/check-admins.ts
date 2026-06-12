import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const admins = await prisma.user.findMany({
    where: {
      role: { in: ['super_admin', 'admin'] },
    },
    select: {
      phone: true,
      role: true,
      nickname: true,
      status: true,
    },
  })

  if (admins.length === 0) {
    console.log('数据库中没有 super_admin 或 admin 角色的用户。')
  } else {
    console.log(`找到 ${admins.length} 个管理员用户：`)
    console.table(
      admins.map((u) => ({
        手机号: u.phone,
        角色: u.role,
        昵称: u.nickname || '-',
        状态: u.status,
      }))
    )
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
