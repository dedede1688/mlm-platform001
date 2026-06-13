'use client'

import Link from 'next/link'

export default function CTASection() {
  return (
    <section className=\"py-16 md:py-24 hero-gradient relative overflow-hidden\">
      {/* 背景装饰 */}
      <div className=\"absolute inset-0 opacity-10\" style={{
        backgroundImage: \"radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 50%, white 1px, transparent 1px)\",
        backgroundSize: '40px 40px'
      }} />

      <div className=\"relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center\">
        <h2 className=\"text-3xl md:text-4xl font-bold text-white mb-4\">
          还在犹豫什么？
        </h2>
        <p className=\"text-lg md:text-xl text-white/80 mb-8 max-w-2xl mx-auto\">
          加入敏维科技，开启健康+收益双重回报
        </p>
        <div className=\"flex flex-col sm:flex-row gap-4 justify-center\">
          <Link
            href=\"/register\"
            className=\"inline-flex items-center justify-center px-8 py-4 bg-white text-[#1B5E3B] font-semibold rounded-lg shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200\"
          >
            免费注册
          </Link>
          <Link
            href=\"/products\"
            className=\"inline-flex items-center justify-center px-8 py-4 bg-transparent border-2 border-white text-white font-semibold rounded-lg hover:bg-white/10 transition-all duration-200\"
          >
            了解更多
          </Link>
        </div>
      </div>
    </section>
  )
}
