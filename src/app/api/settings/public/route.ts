import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 获取公开系统配置（非敏感信息）
export async function GET() {
  try {
    const config = await prisma.systemConfig.findFirst()

    if (!config) {
      // 返回默认值
      return NextResponse.json({
        success: true,
        data: {
          siteName: '敏维生物·健康商城',
          logoUrl: '/logo.png',
          contactPhone: '18566793066',
          serviceTime: '周一至周日 9:00-21:00',
          companyName: '广州敏维生物科技有限公司',
          icp: '粤ICP备XXXXXXXX号',
          copyright: '2026',
          aboutUs: null,
          termsHtml: null,
          privacyHtml: null,
          helpFaq: [],
          banners: [],
        },
      })
    }

    // 返回非敏感配置（含关于我们公开内容）
    return NextResponse.json({
      success: true,
      data: {
        siteName: config.siteName ?? '敏维生物·健康商城',
        logoUrl: config.logoUrl ?? '/logo.png',
        contactPhone: config.contactPhone ?? '18566793066',
        serviceTime: config.serviceTime ?? '周一至周日 9:00-21:00',
        companyName: config.companyName ?? '广州敏维生物科技有限公司',
        icp: config.icp ?? '粤ICP备XXXXXXXX号',
        copyright: config.copyright ?? '2026',
        aboutUs: config.aboutUs ?? null,
        termsHtml: config.termsHtml ?? null,
        privacyHtml: config.privacyHtml ?? null,
        helpFaq: (config.helpFaq as Array<{ question: string; answer: string }>) ?? [],
        banners: (config.banners as Array<{ imageUrl: string; link?: string; title?: string }>) ?? [],
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