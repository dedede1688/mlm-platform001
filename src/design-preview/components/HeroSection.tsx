'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export default function HeroSection() {
  return (
    <section className=\"hero-gradient relative min-h-[85vh] flex items-center overflow-hidden\">
      {/* 背景纹理 */}
      <div className=\"absolute inset-0 opacity-5\" style={{
        backgroundImage: \"url('data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')\"
      }} />

      <div className=\"relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32\">
        <div className=\"grid grid-cols-1 lg:grid-cols-2 gap-12 items-center\">
          {/* 品牌故事 */}
          <div className=\"animate-fade-in text-white\">
            <h1 className=\"text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6\">
              耐高温泉出金花草菌<br />
              <span className=\"text-[#2DD4BF]\">冠突散囊菌，专刊认证</span>
            </h1>
            <p className=\"text-lg md:text-xl text-white/80 mb-2\">
              降血脂 &bull; 调菌群 &bull; 强免疫
            </p>
            <p className=\"text-base text-white/60 mb-8 max-w-lg\">
              源自青藏高原，中科院博士团队历经13年潜心研究，
              从实验室到量产全程可追溯
            </p>
            <div className=\"flex flex-col sm:flex-row gap-4\">
              <Link
                href=\"/products\"
                className=\"inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-[#1B5E3B] font-semibold rounded-lg shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200\"
              >
                了解产品
                <ArrowRight className=\"w-5 h-5\" />
              </Link>
              <Link
                href=\"/register\"
                className=\"inline-flex items-center justify-center gap-2 px-8 py-4 bg-transparent border-2 border-white text-white font-semibold rounded-lg hover:bg-white/10 transition-all duration-200\"
              >
                免费注册
              </Link>
            </div>
          </div>

          {/* 产品展示 - 浮动画 */}
          <div className=\"flex justify-center lg:justify-end animate-float\">
            <div className=\"relative w-72 h-72 md:w-96 md:h-96\">
              {/* 产品占位图 - 用渐变圆代替 */}
              <div className=\"absolute inset-0 rounded-full bg-gradient-to-br from-white/20 to-white/5 backdrop-blur-sm border border-white/20 flex items-center justify-center\">
                <div className=\"text-center text-white\">
                  <div className=\"text-6xl md:text-8xl mb-4\">🌿</div>
                  <p className=\"text-sm md:text-base font-medium\">冠突散囊菌产品</p>
                  <p className=\"text-xs md:text-sm text-white/70 mt-1\">13年科研结晶</p>
                </div>
              </div>
              {/* 装饰光环 */}
              <div className=\"absolute -inset-4 rounded-full border border-white/10\" />
              <div className=\"absolute -inset-8 rounded-full border border-white/5\" />
            </div>
          </div>
        </div>
      </div>

      {/* 底部装饰线 */}
      <div className=\"absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#2DD4BF] to-transparent opacity-50\" />
    </section>
  )
}
