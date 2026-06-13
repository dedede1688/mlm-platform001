import './globals-design.css'

export const metadata = {
  title: '敏维科技 · 设计预览',
  description: '敏维科技健康商城 - 全新首页设计预览',
}

export default function DesignLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}
