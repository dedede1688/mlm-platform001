const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  // 用 hex 查看 nickname 的实际字节
  const user = await p.user.findUnique({
    where: { phone: '13800138000' },
    select: { id: true, nickname: true, phone: true, role: true }
  })
  console.log('Current nickname:', user.nickname)
  console.log('Hex:', Buffer.from(user.nickname || '').toString('hex'))

  // 修复为正确的中文
  const correctNickname = '超级管理员'
  await p.user.update({
    where: { phone: '13800138000' },
    data: { nickname: correctNickname }
  })

  // 验证
  const updated = await p.user.findUnique({
    where: { phone: '13800138000' },
    select: { id: true, nickname: true }
  })
  console.log('Updated nickname:', updated.nickname)
  console.log('Updated hex:', Buffer.from(updated.nickname).toString('hex'))
}

main()
  .catch(e => console.error(e))
  .finally(() => p.$disconnect())
