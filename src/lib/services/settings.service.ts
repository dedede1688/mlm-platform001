import { prisma } from '@/lib/prisma'

export class SettingsService {
  static async getSiteSettings() {
    const config = await prisma.systemConfig.findUnique({
      where: { key: 'site_settings' },
    })
    if (!config) return null
    return config
  }

  static async updateSiteSettings(data: Record<string, unknown>) {
    const existing = await prisma.systemConfig.findUnique({
      where: { key: 'site_settings' },
    })
    if (existing) {
      return prisma.systemConfig.update({
        where: { id: existing.id },
        data,
      })
    }
    return prisma.systemConfig.upsert({
      where: { key: 'site_settings' },
      update: data,
      create: {
        key: 'site_settings',
        value: 'system',
        ...data,
      },
    })
  }
  static async getConfig(key: string) {
    try {
      const row = await prisma.systemConfig.findUnique({ where: { key } })
      if (!row) return null
      const parsed = JSON.parse(row.value)
      if (typeof parsed !== 'object' || parsed === null) return null
      return parsed as Record<string, unknown>
    } catch {
      return null
    }
  }

  static async saveConfig(key: string, value: string, description?: string, userId?: string) {
    const result = await prisma.systemConfig.upsert({
      where: { key },
      create: { key, value, description: description || '' },
      update: { value, description: description || undefined },
    })
    if (userId) {
      const { logOperation } = await import('@/lib/utils/operation-log')
      await logOperation({
        userId,
        action: 'UPDATE',
        module: 'setting',
        targetId: key,
      })
    }
    return result
  }

}
