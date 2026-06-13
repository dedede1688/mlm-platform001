'use client'

import Link from 'next/link'
import { MapPin, Phone, Clock, Heart } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="bg-gradient-to-b from-[#1B5E3B] to-[#0F2919] text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
          {/* 公司介绍 */}
          <div className="md:col-span-1">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Heart className="w-5 h-5 text-[#2DD4BF]" />
              敏维科技
            </h3>
            <div className="space-y-3 text-sm text-white/70">
              <p className="flex items-center gap-2">
                <MapPin className="w-4 h-4 flex-shrink-0" />
                广州市花都区金谷南路9号
              </p>
              <p className="flex items-center gap-2">
                <Phone className="w-4 h-4 flex-shrink-0" />
                18566793066
              </p>
              <p className="flex items-center gap-2">
                <Clock className="w-4 h-4 flex-shrink-0" />
                周一至周日 9:00-21:00
              </p>
            </div>
          </div>

          {/* 导航 */}
          <div>
            <h3 className="text-base font-semibold mb-4">快速导航</h3>
            <div className="space-y-2 text-sm">
              <Link href="/products" className="block text-white/70 hover:text-white transition-colors">商品中心</Link>
              <Link href="/register" className="block text-white/70 hover:text-white transition-colors">免费注册</Link>
              <Link href="/login" className="block text-white/70 hover:text-white transition-colors">会员登录</Link>
            </div>
          </div>

          {/* 会员 */}
          <div>
            <h3 className="text-base font-semibold mb-4">会员服务</h3>
            <div className="space-y-2 text-sm">
              <Link href="/dashboard" className="block text-white/70 hover:text-white transition-colors">会员中心</Link>
              <Link href="/help" className="block text-white/70 hover:text-white transition-colors">帮助中心</Link>
              <Link href="/about" className="block text-white/70 hover:text-white transition-colors">关于我们</Link>
            </div>
          </div>

          {/* 认证 */}
          <div>
            <h3 className="text-base font-semibold mb-4">资质认证</h3>
            <div className="space-y-2 text-sm text-white/70">
              <p>ICP备案号：粤ICP备XXXXXXXX号</p>
              <p>© 2026 广州敏维科技有限公司</p>
            </div>
          </div>
        </div>

        {/* 底部 */}
        <div className="pt-6 border-t border-white/10 text-center text-sm text-white/50">
          <p>© 2026 广州敏维科技有限公司. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
