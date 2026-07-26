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
}
