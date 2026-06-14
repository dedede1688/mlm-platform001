import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'

// GET：获取所有系统配置（管理员）
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError || !admin) return authError!

    // 使用 findUnique 精确查询，避免返回错误记录
    const config = await prisma.systemConfig.findUnique({
      where: { key: 'site_settings' },
    })

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
          siteName: '敏维科技',
          logoUrl: '/logo.png',
          contactPhone: '18566793066',
          serviceEmail: '381901944@qq.com',
          serviceTime: '周一至周日 9:00-21:00',
          companyName: '广州敏维科技有限公司',
          companyAddress: '广州市花都区金谷南路',
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
        siteName: config.siteName ?? '敏维科技',
        logoUrl: config.logoUrl ?? '/logo.png',
        contactPhone: config.contactPhone ?? '18566793066',
        serviceEmail: config.serviceEmail ?? '381901944@qq.com',
        serviceTime: config.serviceTime ?? '周一至周日 9:00-21:00',
        companyName: config.companyName ?? '广州敏维科技有限公司',
        companyAddress: config.companyAddress ?? '广州市花都区金谷南路',
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

    // 调试日志：打印接收到的数据
    console.log('[Settings PUT] Received body:', JSON.stringify(body, null, 2))

    // 辅助函数：trim 字符串值（防止用户输入带空格）
    const trimVal = (v: string | undefined | null) => (typeof v === 'string' ? v.trim() : v)

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

    // 获取或创建配置记录（使用 findUnique 精确定位）
    const existing = await prisma.systemConfig.findUnique({
      where: { key: 'site_settings' },
    })

    const updateData = {
      siteName: trimVal(siteName),
      logoUrl: trimVal(logoUrl),
      contactPhone: trimVal(contactPhone),
      serviceEmail: trimVal(serviceEmail),
      serviceTime: trimVal(serviceTime),
      companyName: trimVal(companyName),
      companyAddress: trimVal(companyAddress),
      icp: trimVal(icp),
      copyright: trimVal(copyright),
      aboutUs: trimVal(aboutUs),
      termsHtml: trimVal(termsHtml),
      privacyHtml: trimVal(privacyHtml),
      helpFaq: helpFaq ?? undefined,
      seoTitle: trimVal(seoTitle),
      seoDescription: trimVal(seoDescription),
      seoKeywords: trimVal(seoKeywords),
      paymentProvider: trimVal(paymentProvider),
      paymentMerchantId: trimVal(paymentMerchantId),
      paymentSecret: trimVal(paymentSecret),
      paymentNotifyUrl: trimVal(paymentNotifyUrl),
    }

    let config
    if (existing) {
      config = await prisma.systemConfig.update({
        where: { id: existing.id },
        data: updateData,
      })
    } else {
      // 使用 upsert 确保只创建一条记录
      config = await prisma.systemConfig.upsert({
        where: { key: 'site_settings' },
        update: updateData,
        create: {
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