import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 获取公开系统配置（非敏感信息）
export async function GET() {
  try {
    const config = await prisma.systemConfig.findFirst()

    // 从独立 banners 表查询轮播图
    const bannerRecords = await prisma.banners.findMany({
      orderBy: { order: 'asc' },
    })
    const banners = bannerRecords.map(record => ({
      id: record.id,
      imageUrl: record.image_url,
      link: record.link ?? undefined,
      title: record.title ?? undefined,
      alt: record.alt ?? undefined,
      order: record.order ?? 0,
    }))

    if (!config) {
      // 返回默认值（注意：logoUrl 为空字符串，前端会用 logo.svg 兜底）
      return NextResponse.json({
        success: true,
        data: {
          siteName: '敏维生物·健康商城',
          logoUrl: '',
          contactPhone: '18566793066',
          serviceTime: '周一至周日 9:00-21:00',
          companyName: '广州敏维生物科技有限公司',
          companyAddress: '广州市花都区金谷南路9号',
          icp: '粤ICP备XXXXXXXX号',
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
        },
      })
    }

    // 返回非敏感配置（含关于我们公开内容）
    return NextResponse.json({
      success: true,
      data: {
        siteName: config.siteName ?? '敏维生物·健康商城',
        // logoUrl 为空时前端会用 logo.svg 兜底
        logoUrl: config.logoUrl ?? '',
        contactPhone: config.contactPhone ?? '18566793066',
        serviceTime: config.serviceTime ?? '周一至周日 9:00-21:00',
        companyName: config.companyName ?? '广州敏维生物科技有限公司',
        companyAddress: config.companyAddress ?? '广州市花都区金谷南路9号',
        icp: config.icp ?? '粤ICP备XXXXXXXX号',
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
      },
    })
  } catch (error) {
    console.error('获取公开配置失败:', error)
    return NextResponse.json(
      { error: '获取配置失败' },
      { status: 500 }
    )
  }
}