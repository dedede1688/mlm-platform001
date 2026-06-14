'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { MapPin, Phone, Clock } from 'lucide-react'

interface PublicSettings {
  siteName: string
  logoUrl: string
  contactPhone: string
  serviceEmail: string
  serviceTime: string
  companyName: string
  companyAddress: string
  icp: string
  copyright: string
}

const defaultSettings: PublicSettings = {
  siteName: '敏维科技',
  logoUrl: '/logo.svg',
  contactPhone: '18566793066',
  serviceEmail: '381901944@qq.com',
  serviceTime: '周一至周日 9:00-21:00',
  companyName: '广州敏维科技有限公司',
  companyAddress: '广州市花都区金谷南路',
  icp: '粤ICP备XXXXXXXX号',
  copyright: '2026',
}

export default function Footer() {
  const [settings, setSettings] = useState<PublicSettings | null>(null)

  useEffect(() => {
    // 加载站点设置（禁用缓存确保获取最新数据）
    fetch('/api/settings/public', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setSettings(data.data)
        } else {
          setSettings(defaultSettings)
        }
      })
      .catch(() => {
        setSettings(defaultSettings)
      })
  }, [])

  const s = settings ?? defaultSettings
  const loading = settings === null

  return (
    <footer className="bg-gray-800 mt-auto py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* 上部信息区 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* 公司信息 */}
          <div>
            <h3 className="text-base font-semibold text-white mb-3">
              {loading ? <span className="inline-block h-5 w-32 bg-gray-700 rounded animate-pulse" /> : s.companyName}
            </h3>
            <div className="space-y-2 text-sm text-gray-400">
              <p className="flex items-center gap-2">
                <MapPin className="w-4 h-4 flex-shrink-0" />
                {loading ? <span className="inline-block h-4 w-36 bg-gray-700 rounded animate-pulse" /> : s.companyAddress}
              </p>
              <p className="flex items-center gap-2">
                <Phone className="w-4 h-4 flex-shrink-0" />
                {loading ? <span className="inline-block h-4 w-24 bg-gray-700 rounded animate-pulse" /> : s.contactPhone}
              </p>
              <p className="flex items-center gap-2">
                <Clock className="w-4 h-4 flex-shrink-0" />
                {loading ? <span className="inline-block h-4 w-36 bg-gray-700 rounded animate-pulse" /> : s.serviceTime}
              </p>
              <p className="flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                {loading ? <span className="inline-block h-4 w-32 bg-gray-700 rounded animate-pulse" /> : s.serviceEmail}
              </p>
            </div>
          </div>

          {/* 快速链接 */}
          <div>
            <h3 className="text-base font-semibold text-white mb-3">快速链接</h3>
            <div className="space-y-2 text-sm">
              <Link href="/products" className="block text-gray-400 hover:text-white transition-colors">商品中心</Link>
              <Link href="/about" className="block text-gray-400 hover:text-white transition-colors">关于我们</Link>
              <Link href="/help" className="block text-gray-400 hover:text-white transition-colors">帮助中心</Link>
            </div>
          </div>

          {/* 会员服务 */}
          <div>
            <h3 className="text-base font-semibold text-white mb-3">会员服务</h3>
            <div className="space-y-2 text-sm">
              <Link href="/login" className="block text-gray-400 hover:text-white transition-colors">会员登录</Link>
              <Link href="/register" className="block text-gray-400 hover:text-white transition-colors">免费注册</Link>
              <Link href="/dashboard" className="block text-gray-400 hover:text-white transition-colors">会员中心</Link>
            </div>
          </div>
        </div>

        {/* 底部版权区 */}
        <div className="pt-6 border-t border-gray-700 text-center text-sm text-gray-500">
          <p>&copy; {loading ? '2026' : s.copyright} {loading ? '' : s.companyName}. All rights reserved.</p>
          <p className="mt-1">{loading ? <span className="inline-block h-4 w-28 bg-gray-700 rounded animate-pulse" /> : s.icp}</p>
        </div>
      </div>
    </footer>
  )
}