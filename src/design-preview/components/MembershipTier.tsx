'use client'

import { Users, TrendingUp, Coins, Crown, Star, Shield } from 'lucide-react'

const tiers = [
  {
    name: '尊贵会员',
    icon: Users,
    req: '基础',
    reward: '分享奖励',
    desc: '免费注册，享10%直推奖励',
    color: 'from-[#1B5E3B] to-[#2DD4BF]',
    borderColor: 'border-[#1B5E3B]',
  },
  {
    name: '经销商',
    icon: TrendingUp,
    req: '购买10件',
    reward: '品牌权益',
    desc: '享20%品牌管理奖',
    color: 'from-[#166534] to-[#15803D]',
    borderColor: 'border-[#166534]',
  },
  {
    name: '内务主任',
    icon: Coins,
    req: '团队3人',
    reward: '丰厚激励',
    desc: '享团队奖 + 分红权',
    color: 'from-[#15803D] to-[#2DD4BF]',
    borderColor: 'border-[#15803D]',
  },
  {
    name: '主事经理',
    icon: Crown,
    req: '团队6人',
    reward: '尊享分红',
    desc: '享更高分红比例',
    color: 'from-[#2D6A4F] to-[#40916C]',
    borderColor: 'border-[#2D6A4F]',
  },
  {
    name: '总监',
    icon: Star,
    req: '团队9人',
    reward: '至尊分红',
    desc: '享顶级分红比例',
    color: 'from-[#40916C] to-[#2DD4BF]',
    borderColor: 'border-[#40916C]',
  },
  {
    name: '董事',
    icon: Shield,
    req: '团队30人',
    reward: '董事分红',
    desc: '享最高分红比例',
    color: 'from-[#0F2919] to-[#1B5E3B]',
    borderColor: 'border-[#0F2919]',
  },
]

export default function MembershipTier() {
  return (
    <section className="section-padding bg-[#F8FAF8]">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-center text-[#0F172A] mb-2">
          加入敏维科技，开启健康+收益双重回报
        </h2>
        <p className="text-center text-[#64748B] mb-12">
          分享奖励 + 品牌权益 + 丰厚激励 + 尊享分红，收益源源不断
        </p>

        {/* 桌面端 - 水平阶梯 */}
        <div className="hidden lg:block">
          <div className="flex items-stretch gap-3">
            {tiers.map((tier, index) => {
              const Icon = tier.icon
              return (
                <div
                  key={index}
                  className={lex-1 bg-white rounded-2xl border-2  shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden animate-fade-in}
                  style={{ animationDelay: ${index * 100}ms }}
                >
                  {/* 顶部渐变条 */}
                  <div className={h-2 bg-gradient-to-r } />

                  <div className="p-6 text-center">
                    {/* 图标 */}
                    <div className={w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br  flex items-center justify-center shadow-md}>
                      <Icon className="w-7 h-7 text-white" />
                    </div>

                    {/* 名称 */}
                    <h3 className="text-lg font-bold text-[#0F172A] mb-1">
                      {tier.name}
                    </h3>

                    {/* 要求 */}
                    <p className="text-xs text-[#64748B] mb-3">
                      要求：{tier.req}
                    </p>

                    {/* 奖励 */}
                    <div className={inline-block px-3 py-1 rounded-full text-sm font-medium bg-gradient-to-r  text-white mb-3}>
                      {tier.reward}
                    </div>

                    {/* 描述 */}
                    <p className="text-sm text-[#64748B]">
                      {tier.desc}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 箭头连接 */}
          <div className="flex justify-between mt-4 px-2">
            {tiers.slice(0, -1).map((_, i) => (
              <div key={i} className="flex-1 flex justify-center">
                <div className="text-[#1B5E3B] text-2xl">→</div>
              </div>
            ))}
          </div>
        </div>

        {/* 移动端 - 垂直时间轴 */}
        <div className="lg:hidden space-y-4">
          {tiers.map((tier, index) => {
            const Icon = tier.icon
            return (
              <div
                key={index}
                className="bg-white rounded-xl border-2 border-[#1B5E3B] shadow-sm p-5 animate-fade-in flex items-start gap-4"
                style={{ animationDelay: ${index * 100}ms }}
              >
                <div className={w-12 h-12 flex-shrink-0 rounded-xl bg-gradient-to-br  flex items-center justify-center}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-bold text-[#0F172A]">{tier.name}</h3>
                    <span className={	ext-xs px-2 py-0.5 rounded-full bg-gradient-to-r  text-white}>
                      {tier.reward}
                    </span>
                  </div>
                  <p className="text-xs text-[#64748B] mb-1">要求：{tier.req}</p>
                  <p className="text-sm text-[#64748B]">{tier.desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
