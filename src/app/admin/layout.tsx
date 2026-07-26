'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  LogOut, Menu, X, ChevronRight, Loader2,
  ShieldAlert
} from 'lucide-react'
import { MENU_ITEMS, ROLE_MENUS } from '@/lib/admin-menu'
import { getAuthUser, removeAuthUser } from '@/lib/utils/auth-token'

// ---- 所有管理员角色（用于权限验证） ----
const ALL_ADMIN_ROLES = Object.keys(ROLE_MENUS)

// ---- 侧边栏导航（从 admin-menu.ts 动态构建） ----

interface NavItem {
  id: string
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

// v65:从 MENU_ITEMS 动态构建(不再硬编码 'logs',已在 menu 中)
const NAV_ITEMS: NavItem[] = MENU_ITEMS.map(item => ({
  id: item.id,
  href: item.path,
  label: item.name,
  icon: item.icon,
}))

// ---- 面包屑映射（从 MENU_ITEMS 动态构建） ----

const BREADCRUMB_MAP: Record<string, string> = Object.fromEntries(
  MENU_ITEMS.map(item => [item.path, item.name])
)

// ---- 布局组件 ----

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname
  const [adminName, setAdminName] = useState('')
  const [userRole, setUserRole] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [authed, setAuthed] = useState(false)
  const [noPermission, setNoPermission] = useState(false)
  // v66:从 API 拉的自定义角色菜单(DB 覆盖 ROLE_MENUS 默认)
  const [customRoleMenus, setCustomRoleMenus] = useState<Record<string, string[]> | null>(null)


  // ?????HttpOnly cookie ???sessionStorage ???Batch 20?
  useEffect(() => {
    let cancelled = false

    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/me')

        if (res.status === 401) {
          const cachedUser = getAuthUser()
          if (cachedUser) {
            const role = (cachedUser as Record<string, unknown>).role as string || ''
            if (!ALL_ADMIN_ROLES.includes(role)) {
              if (!cancelled) setNoPermission(true)
              return
            }
            if (!cancelled) {
              setUserRole(role)
              setAdminName((cachedUser as Record<string, unknown>).nickname as string || '???')
              setAuthed(true)
            }
            return
          }
          removeAuthUser()
          router.push('/login')
          return
        }

        const data = await res.json()

        if (cancelled) return

        if (!data.success || !data.data) {
          const cachedUser = getAuthUser()
          if (cachedUser) {
            const role = (cachedUser as Record<string, unknown>).role as string || ''
            if (!ALL_ADMIN_ROLES.includes(role)) {
              setNoPermission(true)
              return
            }
            setUserRole(role)
            setAdminName((cachedUser as Record<string, unknown>).nickname as string || '???')
            setAuthed(true)
            return
          }
          removeAuthUser()
          router.push('/login')
          return
        }

        const user = data.data
        const role = user.role || ''

        if (!ALL_ADMIN_ROLES.includes(role)) {
          setNoPermission(true)
          return
        }

        setUserRole(role)
        setAdminName(user.nickname || user.phone || '???')
        setAuthed(true)
      } catch {
        const cachedUser = getAuthUser()
        if (cachedUser) {
          const role = (cachedUser as Record<string, unknown>).role as string || ''
          if (ALL_ADMIN_ROLES.includes(role)) {
            setUserRole(role)
            setAdminName((cachedUser as Record<string, unknown>).nickname as string || '???')
            setAuthed(true)
            return
          }
        }
        removeAuthUser()
        router.push('/login')
      }
    }

    checkAuth()

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // v66:从 API 拉自定义角色菜单(可选覆盖,失败时用默认)
  useEffect(() => {
    if (!authed) return
    let cancelled = false
    Promise.all([
      fetch('/api/admin/roles', {
        headers: {} // Batch 20: cookie auto-sends,
      }).then(r => r.json()),
      // v68:同时拉操作权限
      fetch('/api/admin/role-permissions', {
        headers: {} // Batch 20: cookie auto-sends,
      }).then(r => r.json()),
    ])
      .then(([menusData, permsData]) => {
        if (cancelled) return
        if (menusData?.success && menusData?.data?.config) {
          setCustomRoleMenus(menusData.data.config)
        }
        // v68:注入操作权限到 window,供 hasPermission() 使用
        if (permsData?.success && permsData?.data?.config) {
          ;(window as any).__ROLE_PERMISSIONS__ = permsData.data.config
        }
      })
      .catch(() => { /* 静默失败,使用默认 */ })
    return () => { cancelled = true }
  }, [authed])

  // 根据角色过滤菜单（v66: 优先用 customRoleMenus, fallback 到 ROLE_MENUS 默认）
  const allowedMenuIds = (customRoleMenus?.[userRole] || ROLE_MENUS[userRole] || [])
  const visibleNavItems = NAV_ITEMS.filter(item => allowedMenuIds.includes(item.id))

  // 退出登录
  // ?????Batch 20: ?? sessionStorage + ?? logout API ?? cookie?
  const handleLogout = () => {
    removeAuthUser()
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
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
          © 2026 敏维科技
        </footer>
      </div>
    </div>
  )
}