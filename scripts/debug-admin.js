const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  const user = await p.user.findUnique({
    where: { phone: '13800138000' },
    select: { id: true, phone: true, role: true, status: true, passwordHash: true, nickname: true }
  })
  console.log('Admin user:', JSON.stringify(user, null, 2))

  if (user) {
    // 模拟 JWT token 生成
    const jwt = require('jsonwebtoken')
    const token = jwt.sign(
      { userId: user.id, phone: user.phone, role: user.role },
      'a19c9d99e23a136729bbab588e2c7314c8403f73892d04e9bf793050db01734f',
      { expiresIn: '7d' }
    )
    console.log('Generated token (first 30 chars):', token.substring(0, 30) + '...')

    // 用这个 token 调用 /api/auth/me 验证
    const payload = jwt.verify(token, 'a19c9d99e23a136729bbab588e2c7314c8403f73892d04e9bf793050db01734f')
    console.log('Decoded payload:', payload)
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => p.$disconnect())
