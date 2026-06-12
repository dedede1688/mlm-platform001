const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  const user = await p.user.findUnique({
    where: { phone: '13800138000' },
    select: { nickname: true }
  })
  // 写到文件，用 utf8 编码保存，避免终端显示问题
  const fs = require('fs')
  const content = `数据库中 admin 用户的 nickname 字节: ${user.nickname}\n` +
                  `UTF-8 十六进制: ${Buffer.from(user.nickname || '').toString('hex')}\n` +
                  `应该是 超级管理员 的 UTF-8 编码\n` +
                  `字节数: ${Buffer.byteLength(user.nickname || '', 'utf8')}\n`
  fs.writeFileSync('admin-nickname-check.txt', content, 'utf8')
  console.log('已写入 admin-nickname-check.txt')
}

main()
  .catch(e => console.error(e))
  .finally(() => p.$disconnect())
