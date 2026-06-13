'use client'

import { FlaskConical, Microscope, HeartPulse, Award } from 'lucide-react'

const features = [
  {
    icon: FlaskConical,
    title: '源自青藏高原',
    desc: '耐高温21℃',
    detail: '冠突散囊菌从青藏高原特殊环境中筛选，经21℃高温仍保持活性',
    iconBg: 'from-[#1B5E3B] to-[#2DD4BF]',
  },
  {
    icon: Microscope,
    title: '中科院博士团队',
    desc: '13年科研',
    detail: '由中科院博士团队历经13年潜心研究，从实验室到量产全程可追溯',
    iconBg: 'from-[#166534] to-[#15803D]',
  },
  {
    icon: HeartPulse,
    title: '降血脂 · 调菌群 · 强免疫',
    desc: '三重健康守护',
    detail: '经科学验证，可降血脂、调节肠道菌群、增强免疫力，三重健康守护',
    iconBg: 'from-[#15803D] to-[#2DD4BF]',
  },
  {
    icon: Award,
    title: '从实验室到量产',
    desc: '专利认证',
    detail: '拥有完整知识产权体系，多项发明专利认证，品质有保障',
    iconBg: 'from-[#2D6A4F] to-[#40916C]',
  },
]

export default function BrandFeatures() {
  return (
    <section className=\"section-padding\">
      <div className=\"max-w-6xl mx-auto\">
        <h2 className=\"text-3xl md:text-4xl font-bold text-center text-[#0F172A] mb-3\">
          科技赋能健康
        </h2>
        <p className=\"text-center text-[#64748B] mb-12 max-w-2xl mx-auto\">
          源自青藏高原的科研结晶，13年潜心研究，只为带给您最优质的健康产品
        </p>

        <div className=\"grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8\">
          {features.map((feature, index) => {
            const Icon = feature.icon
            const isEven = index % 2 === 0

            return (
              <div
                key={index}
                className={lex items-start gap-4 md:gap-6 p-6 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300 animate-fade-in}
                style={{ animationDelay: ${index * 100}ms }}
              >
                {/* 图标 */}
                <div className={lex-shrink-0 w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br  flex items-center justify-center}>
                  <Icon className=\"w-7 h-7 md:w-8 md:h-8 text-white\" />
                </div>

                {/* 文字 */}
                <div className=\"flex-1\">
                  <h3 className=\"text-lg md:text-xl font-bold text-[#0F172A] mb-1\">
                    {feature.title}
                  </h3>
                  <p className=\"text-sm font-medium text-[#1B5E3B] mb-2\">
                    {feature.desc}
                  </p>
                  <p className=\"text-sm text-[#64748B] leading-relaxed\">
                    {feature.detail}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
