'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Phone, ShoppingCart, LogOut } from 'lucide-react'
import { useAuthStore } from '@/lib/stores/useAuthStore'

interface PublicSettings {
  siteName: string
  logoUrl: string
  contactPhone: string
  serviceTime: string
  companyName: string
  icp: string
  copyright: string
}

const ALL_ADMIN_ROLES = ['super_admin', 'goods_admin', 'finance_admin', 'support_admin', 'auditor']

const defaultSettings: PublicSettings = {
  siteName: '敏维生物·健康商城',
  logoUrl: '/logo.png',
  contactPhone: '18566793066',
  serviceTime: '周一至周日 9:00-21:00',
  companyName: '广州敏维生物科技有限公司',
  icp: '粤ICP备XXXXXXXX号',
  copyright: '2026',
}

export default function Header() {
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [logoError, _setLogoError] = useState(false)
  const [showPhone, setShowPhone] = useState(false)
  const { user, logout, syncFromStorage } = useAuthStore()

  useEffect(() => {
    // 加载站点设置
    fetch('/api/settings/public')
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

    // 从 localStorage 同步登录状态
    syncFromStorage()

    // 监听同页面登录/退出事件
    const handleAuthChange = () => {
      syncFromStorage()
    }
    window.addEventListener('auth-change', handleAuthChange)

    return () => {
      window.removeEventListener('auth-change', handleAuthChange)
    }
  }, [syncFromStorage])

  const handleLogout = () => {
    logout()
    window.location.href = '/login'
  }

  const s = settings ?? defaultSettings
  const loading = settings === null

  return (
    <header className="bg-white/90 backdrop-blur-sm shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
        {/* Logo / Site Name */}
        <Link href="/" className="flex items-center gap-2 text-2xl font-bold text-primary hover:text-primary-600 transition-colors">
          {loading ? (
            <div className="h-8 w-40 bg-gray-200 rounded animate-pulse" />
          ) : (
            <>
              {s.logoUrl && !logoError ? (
                <div className="relative h-8 w-auto min-w-[100px]">
                  <Image
                    src={s.logoUrl}
                    alt={s.siteName}
                    fill
                    className="object-contain"
                  />
                </div>
              ) : null}
              <span>{s.siteName}</span>
            </>
          )}
        </Link>

        {/* Navigation */}
        <nav className="space-x-4 sm:space-x-6 flex items-center">
          <Link href="/products" className="text-gray-600 hover:text-primary transition-colors font-medium hidden sm:inline">
            商品中心
          </Link>

          {/* 购物车 */}
          <Link
            href="/cart"
            className="text-gray-500 hover:text-primary transition-colors p-1.5 rounded-full hover:bg-primary-50"
            aria-label="购物车"
          >
            <ShoppingCart className="w-5 h-5" />
          </Link>

          {/* 客服电话悬浮图标 */}
          <div className="relative">
            <button
              onMouseEnter={() => setShowPhone(true)}
              onMouseLeave={() => setShowPhone(false)}
              className="text-gray-500 hover:text-primary transition-colors p-1.5 rounded-full hover:bg-primary-50"
              aria-label="客服电话"
            >
              <Phone className="w-5 h-5" />
            </button>
            {showPhone && (
              <div className="absolute right-0 top-full mt-2 bg-white rounded-lg shadow-lg border border-gray-200 py-3 px-4 z-50 whitespace-nowrap">
                <p className="text-sm text-gray-500 mb-1">客服热线</p>
                <p className="text-base font-semibold text-gray-900">{s.contactPhone}</p>
                <p className="text-xs text-gray-400 mt-1">{s.serviceTime}</p>
              </div>
            )}
          </div>

          {/* 已登录 */}
          {user ? (
            <>
              <Link href="/dashboard" className="text-gray-600 hover:text-primary transition-colors font-medium hidden sm:inline">
                个人中心
              </Link>
              {user.role && ALL_ADMIN_ROLES.includes(user.role) && (
                <Link href="/admin/dashboard" className="text-gray-600 hover:text-primary transition-colors font-medium hidden sm:inline">
                  管理后台
                </Link>
              )}
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 text-gray-500 hover:text-red-500 transition-colors font-medium text-sm"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">退出</span>
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-gray-600 hover:text-primary transition-colors font-medium hidden sm:inline">
                登录
              </Link>
              <Link
                href="/register"
                className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-600 transition-colors font-medium shadow-sm hover:shadow-md"
              >
                免费注册
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}