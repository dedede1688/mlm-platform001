import { NextRequest } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { SettingsService } from '@/lib/services/settings.service'
import { BannerService } from '@/lib/services/banner.service'
import { logger } from '@/lib/logger'
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/utils/rate-limit"
import { errorResponse, successResponse } from '@/lib/api-response'

const DEFAULT_SITE = {
  siteName: '敏维科技',
  logoUrl: '/logo.png',
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
  seoTitle: null,
  seoDescription: null,
  seoKeywords: null,
  paymentProvider: 'mock',
  paymentMerchantId: null,
  paymentSecret: null,
  paymentNotifyUrl: null,
}

// GET：获取所有系统配置（管理员）
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError || !admin) return authError!

    const config = await SettingsService.getSiteSettings()
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
      return successResponse({ ...DEFAULT_SITE, banners })
    }

    return successResponse({
      siteName: config.siteName ?? DEFAULT_SITE.siteName,
      logoUrl: config.logoUrl ?? DEFAULT_SITE.logoUrl,
      contactPhone: config.contactPhone ?? DEFAULT_SITE.contactPhone,
      serviceEmail: config.serviceEmail ?? DEFAULT_SITE.serviceEmail,
      serviceTime: config.serviceTime ?? DEFAULT_SITE.serviceTime,
      companyName: config.companyName ?? DEFAULT_SITE.companyName,
      companyAddress: config.companyAddress ?? DEFAULT_SITE.companyAddress,
      icp: config.icp ?? DEFAULT_SITE.icp,
      copyright: config.copyright ?? DEFAULT_SITE.copyright,
      aboutUs: config.aboutUs ?? null,
      termsHtml: config.termsHtml ?? null,
      privacyHtml: config.privacyHtml ?? null,
      helpFaq: config.helpFaq ?? [],
      banners,
      seoTitle: config.seoTitle ?? null,
      seoDescription: config.seoDescription ?? null,
      seoKeywords: config.seoKeywords ?? null,
      paymentProvider: config.paymentProvider ?? 'mock',
      paymentMerchantId: config.paymentMerchantId ?? null,
      paymentSecret: config.paymentSecret ?? null,
      paymentNotifyUrl: config.paymentNotifyUrl ?? null,
    })
  } catch (error) {
    logger.error('获取系统配置失败:', error)
    return errorResponse('获取系统配置失败', 500)
  }
}

// PUT：更新系统配置（管理员）
export async function PUT(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError || !admin) return authError!

    const body = await request.json()

    const trimVal = (v: string | undefined | null) => (typeof v === 'string' ? v.trim() : v)

    const {
      siteName, logoUrl, contactPhone, serviceEmail, serviceTime,
      companyName, companyAddress, icp, copyright,
      aboutUs, termsHtml, privacyHtml, helpFaq,
      seoTitle, seoDescription, seoKeywords,
      paymentProvider, paymentMerchantId, paymentSecret, paymentNotifyUrl,
    } = body

    const updateData: Record<string, unknown> = {
      siteName: trimVal(siteName), logoUrl: trimVal(logoUrl),
      contactPhone: trimVal(contactPhone), serviceEmail: trimVal(serviceEmail),
      serviceTime: trimVal(serviceTime), companyName: trimVal(companyName),
      companyAddress: trimVal(companyAddress), icp: trimVal(icp),
      copyright: trimVal(copyright), aboutUs: trimVal(aboutUs),
      termsHtml: trimVal(termsHtml), privacyHtml: trimVal(privacyHtml),
      helpFaq: helpFaq ?? undefined,
      seoTitle: trimVal(seoTitle), seoDescription: trimVal(seoDescription),
      seoKeywords: trimVal(seoKeywords), paymentProvider: trimVal(paymentProvider),
      paymentMerchantId: trimVal(paymentMerchantId), paymentSecret: trimVal(paymentSecret),
      paymentNotifyUrl: trimVal(paymentNotifyUrl),
    }

    const config = await SettingsService.updateSiteSettings(updateData)

    const bannerRecords = await BannerService.getAll()
    const banners = bannerRecords.map(record => ({
      id: record.id, imageUrl: record.image_url,
      link: record.link ?? undefined, title: record.title ?? undefined,
      alt: record.alt ?? undefined, order: record.order ?? 0,
    }))

    return successResponse({
      siteName: config.siteName, logoUrl: config.logoUrl,
      contactPhone: config.contactPhone, serviceEmail: config.serviceEmail,
      serviceTime: config.serviceTime, companyName: config.companyName,
      companyAddress: config.companyAddress, icp: config.icp,
      copyright: config.copyright, aboutUs: config.aboutUs,
      termsHtml: config.termsHtml, privacyHtml: config.privacyHtml,
      helpFaq: config.helpFaq, banners,
      seoTitle: config.seoTitle, seoDescription: config.seoDescription,
      seoKeywords: config.seoKeywords, paymentProvider: config.paymentProvider,
      paymentMerchantId: config.paymentMerchantId, paymentSecret: config.paymentSecret,
      paymentNotifyUrl: config.paymentNotifyUrl,
    })
  } catch (error: unknown) {
    logger.error('更新系统配置失败:', error)
    return errorResponse('更新系统配置失败', 500)
  }
}
