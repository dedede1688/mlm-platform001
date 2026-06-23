import { prisma } from '@/lib/prisma'

export class WithdrawalRejectTemplateService {
  static async list(enabledOnly: boolean = false) {
    return prisma.withdrawalRejectTemplate.findMany({
      where: enabledOnly ? { isEnabled: true } : undefined,
      orderBy: { sortOrder: 'asc' },
    })
  }

  static async create(data: { title: string; content: string; sortOrder?: number; isEnabled?: boolean }) {
    return prisma.withdrawalRejectTemplate.create({
      data: {
        title: data.title,
        content: data.content,
        sortOrder: data.sortOrder ?? 0,
        isEnabled: data.isEnabled ?? true,
      },
    })
  }

  static async update(id: string, data: { title?: string; content?: string; sortOrder?: number; isEnabled?: boolean }) {
    return prisma.withdrawalRejectTemplate.update({
      where: { id },
      data,
    })
  }

  static async delete(id: string) {
    return prisma.withdrawalRejectTemplate.delete({
      where: { id },
    })
  }
}