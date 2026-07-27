import { sanitizeHtml } from '@/lib/utils/sanitize-html'
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
    const pointsTransferFeePercent = feeConfig ? parseInt(String(feeConfig.value), 10) || 10 : 10
    const bannerRecords = await BannerService.getAll()
    const banners = bannerRecords.map(record => ({
      id: record.id,
      imageUrl: record.image_url,
      link: record.link ?? undefined,
      title: record.title ?? undefined,
      alt: record.alt ?? undefined,
      order: record.order ?? 0,
    }))

    const defaults = {
      siteName: '敏维科技',
      logoUrl: '',
      contactPhone: '18566793066',
      serviceEmail: '381901944@qq.com',
      serviceTime: '周一至周日 9:00-21:00',
      companyName: '广州敏维科技有限公司',
      companyAddress: '广州市花都区金谷南路',
      icp: '粤ICP备XXXXXX号',
      copyright: '2026',
      aboutUs: null as string | null,
      termsHtml: null as string | null,
      privacyHtml: null as string | null,
      helpFaq: [] as Array<{ question: string; answer: string }>,
      banners,
      seoTitle: null as string | null,
      seoDescription: null as string | null,
      seoKeywords: null as string | null,
      paymentProvider: 'mock',
      pointsTransferFeePercent,
    }

    if (!config) {
      const response = successResponse(defaults)
      response.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
      return response
    }

    const payload = {
      siteName: config.siteName ?? defaults.siteName,
      logoUrl: config.logoUrl ?? defaults.logoUrl,
      contactPhone: config.contactPhone ?? defaults.contactPhone,
      serviceEmail: config.serviceEmail ?? defaults.serviceEmail,
      serviceTime: config.serviceTime ?? defaults.serviceTime,
      companyName: config.companyName ?? defaults.companyName,
      companyAddress: config.companyAddress ?? defaults.companyAddress,
      icp: config.icp ?? '',
      copyright: config.copyright ?? defaults.copyright,
      aboutUs: config.aboutUs ? sanitizeHtml(config.aboutUs) : null,
      termsHtml: config.termsHtml ? sanitizeHtml(config.termsHtml) : null,
      privacyHtml: config.privacyHtml ? sanitizeHtml(config.privacyHtml) : null,
      helpFaq: (config.helpFaq as Array<{ question: string; answer: string }>) ?? [],
      banners,
      seoTitle: config.seoTitle ?? null,
      seoDescription: config.seoDescription ?? null,
      seoKeywords: config.seoKeywords ?? null,
      paymentProvider: config.paymentProvider ?? 'mock',
      pointsTransferFeePercent,
    }

    const response = successResponse(payload)
    response.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
    return response
  } catch (error) {
    logger.error('获取公开配置失败:', error)
    return errorResponse('获取配置失败', 500)
  }
}
