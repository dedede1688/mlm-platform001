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
const DEFAULT_SEO_TITLE = "敏维生物·健康商城";
const DEFAULT_SEO_DESCRIPTION = "敏维生物健康商城，提供优质健康产品，多级分销电商平台";
const DEFAULT_SEO_KEYWORDS = "健康商城,敏维生物,健康产品,分销平台";

export async function generateMetadata(): Promise<Metadata> {
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

  return {
    title: seoTitle,
    description: seoDescription,
    keywords: seoKeywords,
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