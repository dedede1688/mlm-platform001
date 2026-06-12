import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'

// GET：获取所有系统配置（管理员）
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError || !admin) return authError!

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
      // 返回默认值
      return NextResponse.json({
        success: true,
        data: {
          siteName: '敏维生物·健康商城',
          logoUrl: '/logo.png',
          contactPhone: '18566793066',
          serviceEmail: 'service@minwei.com',
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
          paymentMerchantId: null,
          paymentSecret: null,
          paymentNotifyUrl: null,
        },
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        siteName: config.siteName ?? '敏维生物·健康商城',
        logoUrl: config.logoUrl ?? '/logo.png',
        contactPhone: config.contactPhone ?? '18566793066',
        serviceEmail: config.serviceEmail ?? 'service@minwei.com',
        serviceTime: config.serviceTime ?? '周一至周日 9:00-21:00',
        companyName: config.companyName ?? '广州敏维生物科技有限公司',
        companyAddress: config.companyAddress ?? '广州市花都区金谷南路9号',
        icp: config.icp ?? '粤ICP备XXXXXXXX号',
        copyright: config.copyright ?? '2026',
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
      },
    })
  } catch (error) {
    console.error('获取系统配置失败:', error)
    return NextResponse.json(
      { error: '获取系统配置失败' },
      { status: 500 }
    )
  }
}

// PUT：更新系统配置（管理员）
export async function PUT(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError || !admin) return authError!

    const body = await request.json()

    const {
      siteName,
      logoUrl,
      contactPhone,
      serviceEmail,
      serviceTime,
      companyName,
      companyAddress,
      icp,
      copyright,
      aboutUs,
      termsHtml,
      privacyHtml,
      helpFaq,
      seoTitle,
      seoDescription,
      seoKeywords,
      paymentProvider,
      paymentMerchantId,
      paymentSecret,
      paymentNotifyUrl,
      // banners 已迁移到独立表，不再写入 SystemConfig
    } = body

    // 获取或创建配置记录
    const existing = await prisma.systemConfig.findFirst()

    const updateData = {
      siteName: siteName ?? undefined,
      logoUrl: logoUrl ?? undefined,
      contactPhone: contactPhone ?? undefined,
      serviceEmail: serviceEmail ?? undefined,
      serviceTime: serviceTime ?? undefined,
      companyName: companyName ?? undefined,
      companyAddress: companyAddress ?? undefined,
      icp: icp ?? undefined,
      copyright: copyright ?? undefined,
      aboutUs: aboutUs ?? undefined,
      termsHtml: termsHtml ?? undefined,
      privacyHtml: privacyHtml ?? undefined,
      helpFaq: helpFaq ?? undefined,
      seoTitle: seoTitle ?? undefined,
      seoDescription: seoDescription ?? undefined,
      seoKeywords: seoKeywords ?? undefined,
      paymentProvider: paymentProvider ?? undefined,
      paymentMerchantId: paymentMerchantId ?? undefined,
      paymentSecret: paymentSecret ?? undefined,
      paymentNotifyUrl: paymentNotifyUrl ?? undefined,
    }

    let config
    if (existing) {
      config = await prisma.systemConfig.update({
        where: { id: existing.id },
        data: updateData,
      })
    } else {
      config = await prisma.systemConfig.create({
        data: {
          key: 'site_settings',
          value: 'system',
          ...updateData,
        },
      })
    }

    // 从独立 banners 表查询最新轮播图
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

    return NextResponse.json({
      success: true,
      data: {
        siteName: config.siteName,
        logoUrl: config.logoUrl,
        contactPhone: config.contactPhone,
        serviceEmail: config.serviceEmail,
        serviceTime: config.serviceTime,
        companyName: config.companyName,
        companyAddress: config.companyAddress,
        icp: config.icp,
        copyright: config.copyright,
        aboutUs: config.aboutUs,
        termsHtml: config.termsHtml,
        privacyHtml: config.privacyHtml,
        helpFaq: config.helpFaq,
        banners,
        seoTitle: config.seoTitle,
        seoDescription: config.seoDescription,
        seoKeywords: config.seoKeywords,
        paymentProvider: config.paymentProvider,
        paymentMerchantId: config.paymentMerchantId,
        paymentSecret: config.paymentSecret,
        paymentNotifyUrl: config.paymentNotifyUrl,
      },
    })
  } catch (error: any) {
    console.error('更新系统配置失败:', error)
    return NextResponse.json(
      { error: '更新系统配置失败' },
      { status: 500 }
    )
  }
}