const fs = require('fs')
const path = require('path')

function loadEnv(file) {
  try {
    const text = fs.readFileSync(file, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (!m) continue
      const key = m[1]
      let value = m[2].trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = value
    }
  } catch (e) {
    // 忽略不存在的 env 文件
  }
}

const root = path.resolve(__dirname, '..')
loadEnv(path.join(root, '.env.local'))
loadEnv(path.join(root, '.env'))

if (!process.env.DATABASE_URL) {
  console.error('未找到 DATABASE_URL，请检查 .env/.env.local')
  process.exit(1)
}

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const templates = [
  {
    type: 'user_status_change',
    channel: 'in_app',
    subject: '账户状态变更通知',
    content:
      '【敏维科技】{{userName}} 您好，您的账户已被{{statusLabel}}，原因：{{reason}}。如有疑问请联系客服。',
  },
  {
    type: 'points_void',
    channel: 'in_app',
    subject: '积分作废通知',
    content:
      '【敏维科技】{{userName}} 您好，您的 {{amount}} 积分已被作废，原因：{{reason}}。当前可用积分：{{remainingPoints}}。如有疑问请联系客服。',
  },
  {
    type: 'manual_reward',
    channel: 'in_app',
    subject: '手动奖励到账通知',
    content:
      '【敏维科技】{{userName}} 您好，您收到一笔手动奖励 ¥{{amount}}，原因：{{reason}}。如有疑问请联系客服。',
  },
]

async function main() {
  console.log('--- 候选测试用户（非 super_admin）---')
  const users = await prisma.user.findMany({
    where: { role: { not: 'super_admin' } },
    select: { id: true, phone: true, nickname: true, role: true },
    take: 5,
    orderBy: { createdAt: 'desc' },
  })
  if (users.length === 0) {
    console.log('未找到非管理员用户，请先注册测试账号。')
  } else {
    for (const u of users) {
      console.log(
        `id=${u.id} phone=${u.phone ?? '-'} nickname=${u.nickname ?? '-'} role=${u.role}`
      )
    }
  }

  console.log('--- 检查并补齐通知模板 ---')
  for (const t of templates) {
    const existing = await prisma.notificationTemplate.findUnique({
      where: { type_channel: { type: t.type, channel: t.channel } },
    })
    if (existing) {
      console.log(`✅ 模板 ${t.type} 已存在`)
    } else {
      await prisma.notificationTemplate.create({ data: { ...t, enabled: true } })
      console.log(`🆕 模板 ${t.type} 已创建`)
    }
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
