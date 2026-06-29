// v57.4 step1 配套：把 v57 步骤 3 实跑时写入的 2 条 type='earn' 记录改成 type='unlock'
// 这些记录的 description 是"积分解锁（第1天，每日1%）"，type 应该是 unlock（前端 FILTER_TABS 对应）
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
;(async () => {
  // 找到所有 description 含"积分解锁"且 type='earn' 的记录
  const records = await p.pointsRecord.findMany({
    where: {
      type: 'earn',
      description: { contains: '积分解锁' },
    },
    select: { id: true, description: true, amount: true, userId: true },
  })
  console.log('匹配到', records.length, '条待修复记录:')
  records.forEach((r) => console.log('  -', r.id, '|', r.description, '| amount=' + r.amount))

  if (records.length === 0) {
    console.log('没有需要修复的记录')
    await p.$disconnect()
    return
  }

  // 批量 update
  const result = await p.pointsRecord.updateMany({
    where: {
      id: { in: records.map((r) => r.id) },
    },
    data: { type: 'unlock' },
  })
  console.log('\n✅ 已更新', result.count, '条记录 type: earn -> unlock')

  await p.$disconnect()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
