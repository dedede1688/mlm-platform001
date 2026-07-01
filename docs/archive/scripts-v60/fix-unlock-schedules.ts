// v57.3: 每日解锁历史数据补建脚本
//   干跑：npx tsx scripts/fix-unlock-schedules.ts --dry-run
//   实跑：npx tsx scripts/fix-unlock-schedules.ts --apply
//
// 修复对象：v55.1 修复之前升级的账号，lockedPoints=0 导致永远无法解锁
// 逻辑：找出 totalPoints > 0 但没有 active schedule 的用户，补建 schedule + lockedPoints

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const isApply = process.argv.includes('--apply')

  console.log('========================================')
  console.log(`  每日解锁历史数据补建脚本`)
  console.log(`  模式: ${isApply ? '实跑（会写 DB）' : '干跑（只输出，不写）'}`)
  console.log('========================================\n')

  // 1. 找出所有有积分的用户
  const allUsers = await prisma.user.findMany({
    where: {
      status: { not: 'deleted' },
      totalPoints: { gt: 0 },
    },
    select: {
      id: true,
      phone: true,
      nickname: true,
      totalPoints: true,
      unlockedPoints: true,
      lockedPoints: true,
      createdAt: true,
    },
  })

  console.log(`共扫描 ${allUsers.length} 个有积分的用户\n`)

  // 2. 查询所有 active schedule（PointsUnlockSchedule 没有 User 关系，需单独查）
  const activeSchedules = await prisma.pointsUnlockSchedule.findMany({
    where: { status: 'active' },
    select: { userId: true, remainingPoints: true, totalPoints: true },
  })

  // 按 userId 分组
  const scheduleMap = new Map<string, typeof activeSchedules>()
  for (const s of activeSchedules) {
    if (!scheduleMap.has(s.userId)) {
      scheduleMap.set(s.userId, [])
    }
    scheduleMap.get(s.userId)!.push(s)
  }

  // 3. 筛选异常用户：无 active schedule 且 (unlocked + locked) < total
  const abnormalUsers = allUsers.filter((u) => {
    const hasActiveSchedule = scheduleMap.has(u.id) && scheduleMap.get(u.id)!.length > 0
    const accounted = u.unlockedPoints + u.lockedPoints
    return !hasActiveSchedule && accounted < u.totalPoints
  })

  console.log(`异常用户数: ${abnormalUsers.length}\n`)

  if (abnormalUsers.length === 0) {
    console.log('✅ 所有用户数据正常，无需修复')
    return
  }

  // 4. 输出每个用户的修复方案
  const fixPlans = abnormalUsers.map((u) => {
    const diff = u.totalPoints - u.unlockedPoints - u.lockedPoints
    return {
      userId: u.id,
      phone: u.phone,
      nickname: u.nickname,
      totalPoints: u.totalPoints,
      unlockedPoints: u.unlockedPoints,
      lockedPoints: u.lockedPoints,
      diff,
      newLockedPoints: u.lockedPoints + diff,
    }
  })

  console.log('===== 修复方案 =====\n')
  console.table(
    fixPlans.map((p) => ({
      phone: p.phone,
      nickname: p.nickname || '(空)',
      total: p.totalPoints,
      unlocked: p.unlockedPoints,
      locked: p.lockedPoints,
      diff: p.diff,
      'new locked': p.newLockedPoints,
    }))
  )

  if (!isApply) {
    console.log('\n⚠️ 干跑模式：未写 DB。如确认无误，加 --apply 参数实跑')
    return
  }

  // 5. 实跑：每个用户建一个合并的 schedule
  const tomorrow = new Date()
  tomorrow.setHours(0, 0, 0, 0)
  tomorrow.setDate(tomorrow.getDate() + 1)

  let successCount = 0
  for (const plan of fixPlans) {
    await prisma.$transaction(async (tx) => {
      // lockedPoints += diff
      await tx.user.update({
        where: { id: plan.userId },
        data: { lockedPoints: { increment: plan.diff } },
      })

      // 建合并的 schedule
      await tx.pointsUnlockSchedule.create({
        data: {
          userId: plan.userId,
          orderId: '', // 历史数据没有 order_id
          totalPoints: plan.diff,
          unlockedPoints: 0,
          remainingPoints: plan.diff,
          dailyUnlockRate: 0.01,
          totalDays: 100,
          completedDays: 0,
          status: 'active',
          nextUnlockDate: tomorrow,
        },
      })
    })
    successCount++
    console.log(`✅ 修复 ${plan.phone}（diff=${plan.diff}）`)
  }

  console.log(`\n========================================`)
  console.log(`  实跑完成: ${successCount}/${fixPlans.length}`)
  console.log(`========================================`)
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error('脚本失败:', err)
    prisma.$disconnect()
    process.exit(1)
  })
