import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export class LevelSnapshotService {
  static async createDailySnapshots(): Promise<{ created: number; skipped: number }> {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const users = await prisma.user.findMany({
      where: { status: 'active' },
      select: {
        id: true,
        level: true,
        directDistributorCount: true,
        directSalesAmount: true,
      },
    })

    let created = 0
    let skipped = 0

    for (const user of users) {
      try {
        await prisma.levelSnapshot.upsert({
          where: { userId_snapshotDate: { userId: user.id, snapshotDate: today } },
          update: { level: user.level, directDistributorCount: user.directDistributorCount, directSalesAmount: user.directSalesAmount },
          create: { userId: user.id, snapshotDate: today, level: user.level, directDistributorCount: user.directDistributorCount, directSalesAmount: user.directSalesAmount },
        })
        created++
      } catch (error) {
        logger.error('[LevelSnapshot] failed', { userId: user.id, error: error instanceof Error ? error.message : String(error) })
        skipped++
      }
    }

    logger.info('[LevelSnapshot] daily done', { created, skipped })
    return { created, skipped }
  }

  static async createSnapshotForUser(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, level: true, directDistributorCount: true, directSalesAmount: true },
    })

    if (!user) { logger.warn('[LevelSnapshot] user not found', { userId }); return }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    await prisma.levelSnapshot.upsert({
      where: { userId_snapshotDate: { userId: user.id, snapshotDate: today } },
      update: { level: user.level, directDistributorCount: user.directDistributorCount, directSalesAmount: user.directSalesAmount },
      create: { userId: user.id, snapshotDate: today, level: user.level, directDistributorCount: user.directDistributorCount, directSalesAmount: user.directSalesAmount },
    })

    logger.info('[LevelSnapshot] user snapshot created', { userId, level: user.level })
  }
}
