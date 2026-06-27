import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { ToastProvider } from "@/components/ToastProvider";
import { prisma } from "@/lib/prisma";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 默认 SEO 配置（数据库未配置时的兜底值）
const DEFAULT_SEO_TITLE = "敏维科技";
const DEFAULT_SEO_DESCRIPTION = "敏维科技健康商城，提供优质健康产品，多级分销电商平台";
const DEFAULT_SEO_KEYWORDS = "健康商城,敏维科技,健康产品,分销平台";

// v52.0: 站点 URL（sitemap/robots/OG meta 共用）
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://mlm-platform001.vercel.app";

// 缓存 SEO 配置，避免每次请求都查询数据库
let cachedSeoConfig: { title: string; description: string; keywords: string } | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 分钟缓存

export async function generateMetadata(): Promise<Metadata> {
  const now = Date.now();

  // 如果缓存有效，直接返回缓存数据
  if (cachedSeoConfig && now - cacheTimestamp < CACHE_DURATION) {
    return buildMetadata(cachedSeoConfig.title, cachedSeoConfig.description, cachedSeoConfig.keywords);
  }

  let seoTitle = DEFAULT_SEO_TITLE;
  let seoDescription = DEFAULT_SEO_DESCRIPTION;
  let seoKeywords = DEFAULT_SEO_KEYWORDS;

  try {
    const config = await prisma.systemConfig.findFirst();
    if (config) {
      seoTitle = config.seoTitle || config.siteName || DEFAULT_SEO_TITLE;
      seoDescription = config.seoDescription || DEFAULT_SEO_DESCRIPTION;
      seoKeywords = config.seoKeywords || DEFAULT_SEO_KEYWORDS;
    }
  } catch (error) {
    console.error("获取 SEO 配置失败，使用默认值:", error);
  }

  // 更新缓存
  cachedSeoConfig = {
    title: seoTitle,
    description: seoDescription,
    keywords: seoKeywords,
  };
  cacheTimestamp = now;

  return buildMetadata(seoTitle, seoDescription, seoKeywords);
}

// v52.0: 完整 metadata 构造（含 OG meta + Twitter Card + canonical）
function buildMetadata(title: string, description: string, keywords: string): Metadata {
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: `%s | ${title}` },
    description,
    keywords,
    // v52.0: Open Graph（Facebook/LinkedIn/微信分享卡片）
    openGraph: {
      type: "website",
      locale: "zh_CN",
      url: SITE_URL,
      siteName: title,
      title,
      description,
      images: [{ url: "/logo.svg", width: 512, height: 512, alt: title }],
    },
    // v52.0: Twitter Card
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/logo.svg"],
    },
    // v52.0: canonical URL（避免重复内容惩罚）
    alternates: { canonical: SITE_URL },
    // v52.0: 爬虫指令
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ToastProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </ToastProvider>
      </body>
    </html>
  );
}