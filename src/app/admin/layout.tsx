'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  BarChart3, Package, ClipboardList, Users, Wallet,
  Settings, LogOut, Menu, X, ChevronRight, Loader2,
  FileText, ShieldAlert
} from 'lucide-react'

// ---- 所有管理员角色 ----
const ALL_ADMIN_ROLES = ['super_admin', 'goods_admin', 'finance_admin', 'support_admin', 'auditor']

// ---- 侧边栏导航配置 ----

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  allowedRoles: string[]
}

const NAV_ITEMS: NavItem[] = [
  { href: '/admin/dashboard', label: '数据仪表盘', icon: BarChart3, allowedRoles: ALL_ADMIN_ROLES },
  { href: '/admin/products', label: '商品管理', icon: Package, allowedRoles: ['super_admin', 'goods_admin'] },
  { href: '/admin/orders', label: '订单管理', icon: ClipboardList, allowedRoles: ['super_admin', 'goods_admin'] },
  { href: '/admin/users', label: '会员管理', icon: Users, allowedRoles: ['super_admin', 'support_admin'] },
  { href: '/admin/finance', label: '财务管理', icon: Wallet, allowedRoles: ['super_admin', 'finance_admin'] },
  { href: '/admin/settings', label: '系统设置', icon: Settings, allowedRoles: ['super_admin'] },
  { href: '/admin/logs', label: '操作日志', icon: FileText, allowedRoles: ['super_admin', 'auditor'] },
]

// ---- 面包屑映射 ----

const BREADCRUMB_MAP: Record<string, string> = {
  '/admin/dashboard': '数据仪表盘',
  '/admin/products': '商品管理',
  '/admin/orders': '订单管理',
  '/admin/users': '会员管理',
  '/admin/finance': '财务管理',
  '/admin/settings': '系统设置',
  '/admin/logs': '操作日志',
}

// ---- 布局组件 ----

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [adminName, setAdminName] = useState('')
  const [userRole, setUserRole] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [authed, setAuthed] = useState(false)
  const [noPermission, setNoPermission] = useState(false)

  // 权限验证
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
      return
    }
    try {
      const userStr = localStorage.getItem('user')
      if (userStr) {
        const user = JSON.parse(userStr)
        // 基于角色权限验证
        const role = user.role || ''
        if (!ALL_ADMIN_ROLES.includes(role)) {
          setNoPermission(true)
          return
        }
        setAdminName(user.nickname || user.phone || '管理员')
        setUserRole(role)
      } else {
        router.push('/login')
        return
      }
    } catch {
      router.push('/login')
      return
    }
    setAuthed(true)
  }, [router])

  // 根据角色过滤菜单
  const visibleNavItems = NAV_ITEMS.filter(item => item.allowedRoles.includes(userRole))

  // 退出登录
  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/login')
  }

  // 判断高亮：pathname 以 nav.href 开头
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  // 面包屑
  const breadcrumb = BREADCRUMB_MAP[pathname] || ''

  // 无权限提示
  if (noPermission) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <ShieldAlert className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">无权限访问</h2>
          <p className="text-gray-500 mb-6">您的账号没有管理后台访问权限</p>
          <button
            onClick={handleLogout}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            退出登录
          </button>
        </div>
      </div>
    )
  }

  // 认证中
  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* ====== 侧边栏 ====== */}
      {/* 遮罩（移动端） */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          flex flex-col`}
      >
        {/* Logo 区域 */}
        <div className="h-16 flex items-center px-6 border-b border-gray-100 flex-shrink-0">
          <Link href="/admin/dashboard" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-white font-bold text-sm">MW</span>
            </div>
            <span className="font-bold text-gray-900 text-lg">敏维管理后台</span>
          </Link>
          {/* 移动端关闭按钮 */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto lg:hidden text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 导航菜单 */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${active
                    ? 'bg-primary-50 text-primary'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
              >
                <item.icon className={`w-5 h-5 ${active ? 'text-primary' : 'text-gray-400'}`} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* 侧边栏底部 */}
        <div className="px-3 py-4 border-t border-gray-100 flex-shrink-0">
          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
            返回前台
          </Link>
        </div>
      </aside>

      {/* ====== 右侧主区域 ====== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶部栏 */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
          {/* 左侧：汉堡菜单（移动端）+ 面包屑 */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-gray-500 hover:text-gray-700"
            >
              <Menu className="w-6 h-6" />
            </button>
            <nav className="flex items-center gap-1.5 text-sm">
              <Link href="/admin/dashboard" className="text-gray-400 hover:text-gray-600 transition-colors">
                后台
              </Link>
              {breadcrumb && (
                <>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                  <span className="text-gray-900 font-medium">{breadcrumb}</span>
                </>
              )}
            </nav>
          </div>

          {/* 右侧：管理员名称 + 退出 */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center">
                <span className="text-primary font-medium text-sm">
                  {adminName.charAt(0)}
                </span>
              </div>
              <span className="text-sm text-gray-700 font-medium">{adminName}</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">退出</span>
            </button>
          </div>
        </header>

        {/* 主内容区 */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>

        {/* 底部版权 */}
        <footer className="py-3 text-center text-xs text-gray-400 border-t border-gray-100 flex-shrink-0">
          © 2026 敏维生物科技
        </footer>
      </div>
    </div>
  )
}