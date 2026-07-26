import { errorResponse, successResponse } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { SettingsService } from '@/lib/services/settings.service'
import { BannerService } from '@/lib/services/banner.service'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const config = await SettingsService.getSiteSettings()
    const feeConfig = await SettingsService.getConfig('points.transfer_fee_percent')
    const pointsTransferFeePercent = feeConfig ? parseInt(feeConfig.value, 10) || 10 : 10
    const bannerRecords = await BannerService.getAll()
    const banners = bannerRecords.map(record => ({
      id: record.id,
      imageUrl: record.image_url,
      link: record.link ?? undefined,
      title: record.title ?? undefined,
      alt: record.alt ?? undefined,
      order: record.order ?? 0,
    }))

    if (!config) {
      return successResponse({
        siteName: '敏维科技',
        logoUrl: '',
        contactPhone: '18566793066',
        serviceEmail: '381901944@qq.com',
        serviceTime: '周一至周日 9:00-21:00',
        companyName: '广州敏维科技有限公司',
        companyAddress: '广州市花都区金谷南路',
        icp: '粤ICP备XXXXXX号',
        copyright: '2026',
        aboutUs: null,
        termsHtml: null,
        privacyHtml: null,
        helpFaq: [],
        banners,
        seoTitle: null,
        seoDescription: null,
        seoKeywords: null,
        paymentProvider: 'mock',
        pointsTransferFeePercent,
      })
    }

    return successResponse({
      siteName: config.siteName ?? '敏维科技',
      logoUrl: config.logoUrl ?? '',
      contactPhone: config.contactPhone ?? '18566793066',
      serviceEmail: config.serviceEmail ?? '381901944@qq.com',
      serviceTime: config.serviceTime ?? '周一至周日 9:00-21:00',
      companyName: config.companyName ?? '广州敏维科技有限公司',
      companyAddress: config.companyAddress ?? '广州市花都区金谷南路',
      icp: config.icp ?? '',
      copyright: config.copyright ?? '2026',
      aboutUs: config.aboutUs ?? null,
      termsHtml: config.termsHtml ?? null,
      privacyHtml: config.privacyHtml ?? null,
      helpFaq: (config.helpFaq as Array<{ question: string; answer: string }>) ?? [],
      banners,
      seoTitle: config.seoTitle ?? null,
      seoDescription: config.seoDescription ?? null,
      seoKeywords: config.seoKeywords ?? null,
      paymentProvider: config.paymentProvider ?? 'mock',
      pointsTransferFeePercent,
    })
  } catch (error) {
    logger.error('获取公开配置失败:', error)
    return errorResponse('获取配置失败', 500)
  }
}
