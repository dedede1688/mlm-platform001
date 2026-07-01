'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Shield, Loader2, Save, AlertCircle, CheckCircle, ChevronLeft, RefreshCw,
  LayoutGrid, KeyRound,
} from 'lucide-react'
import { ACTIONS, ACTION_LABELS, Action } from '@/lib/admin-permissions'

// ---- 6 大类分组(跟 admin-menu.ts 顺序一致) ----

const CATEGORY_GROUPS: { name: string; icon: string; menuIds: string[] }[] = [
  { name: '🏠 数据中台', icon: 'LayoutDashboard', menuIds: ['dashboard', 'reports'] },
  { name: '📦 商品', icon: 'Package', menuIds: ['products', 'categories', 'banners'] },
  { name: '💰 财务', icon: 'DollarSign', menuIds: ['finance', 'refunds', 'withdrawal-templates'] },
  { name: '🛒 订单', icon: 'ShoppingCart', menuIds: ['orders'] },
  { name: '👤 会员', icon: 'Users', menuIds: ['users'] },
  { name: '⚙️ 系统后台', icon: 'Settings', menuIds: ['settings', 'system-parameters', 'notifications', 'notification-history', 'logs', 'roles'] },
]

const ROLE_LABELS: Record<string, string> = {
  super_admin: '超级管理员',
  goods_admin: '商品管理员',
  finance_admin: '财务管理员',
  support_admin: '客服管理员',
  auditor: '审计员',
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
  super_admin: '所有功能 + 配置权限(慎改)',
  goods_admin: '商品 / 订单 / 分类 / 轮播图',
  finance_admin: '财务 / 退款 / 拒绝模板',
  support_admin: '会员管理 / 通知发件箱',
  auditor: '数据中台 + 操作日志(只读)',
}

// v68:5 档操作权限描述
const ACTION_DESCRIPTIONS: Record<Action, string> = {
  view: '看数据',
  create: '新建',
  update: '修改',
  delete: '删除',
  approve: '审批',
}

interface MenuItem { id: string; name: string; path: string }

interface ApiResponse {
  success: boolean
  data?: {
    config: Record<string, string[]>
    isCustomized: boolean
    menuItems: MenuItem[]
  }
  error?: string
}

interface PermissionsApiResponse {
  success: boolean
  data?: {
    config: Record<string, Action[]>
    isCustomized: boolean
    actions: readonly Action[]
  }
  error?: string
}

type TopTab = 'menu' | 'action'

export default function RolesPage() {
  const [token, setToken] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // v68:2 大 tab
  const [topTab, setTopTab] = useState<TopTab>('menu')

  // 菜单权限
  const [menuConfig, setMenuConfig] = useState<Record<string, string[]>>({})
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [isMenuCustomized, setIsMenuCustomized] = useState(false)
  const [activeRole, setActiveRole] = useState<string>('super_admin')

  // 操作权限
  const [actionConfig, setActionConfig] = useState<Record<string, Action[]>>({})
  const [isActionCustomized, setIsActionCustomized] = useState(false)

  useEffect(() => {
    const t = typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''
    setToken(t)
  }, [])

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const [menusRes, permsRes] = await Promise.all([
        fetch('/api/admin/roles', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/role-permissions', { headers: { Authorization: `Bearer ${token}` } }),
      ])
      const menusData: ApiResponse = await menusRes.json()
      const permsData: PermissionsApiResponse = await permsRes.json()

      if (menusData.success && menusData.data) {
        setMenuConfig(menusData.data.config)
        setMenuItems(menusData.data.menuItems)
        setIsMenuCustomized(menusData.data.isCustomized)
      } else {
        setMessage({ type: 'error', text: menusData.error || '加载菜单失败' })
      }
      if (permsData.success && permsData.data) {
        setActionConfig(permsData.data.config)
        setIsActionCustomized(permsData.data.isCustomized)
      } else {
        setMessage({ type: 'error', text: permsData.error || '加载操作权限失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '网络错误' })
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  // ---- 菜单权限操作 ----

  const toggleMenu = (role: string, menuId: string) => {
    setMenuConfig(prev => {
      const list = prev[role] || []
      const next = list.includes(menuId)
        ? list.filter(id => id !== menuId)
        : [...list, menuId]
      return { ...prev, [role]: next }
    })
  }

  const toggleMenuGroup = (role: string, menuIds: string[], allOn: boolean) => {
    setMenuConfig(prev => {
      const list = prev[role] || []
      const next = allOn
        ? list.filter(id => !menuIds.includes(id))
        : Array.from(new Set([...list, ...menuIds]))
      return { ...prev, [role]: next }
    })
  }

  const saveMenus = async () => {
    if (!token) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ config: menuConfig }),
      })
      const data = await res.json()
      if (data.success) {
        setMessage({ type: 'success', text: '菜单权限保存成功' })
        setIsMenuCustomized(true)
      } else {
        setMessage({ type: 'error', text: data.error || '保存失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '网络错误' })
    } finally {
      setSaving(false)
    }
  }

  // ---- 操作权限操作 ----

  const toggleAction = (role: string, action: Action) => {
    setActionConfig(prev => {
      const list = prev[role] || []
      const next = list.includes(action)
        ? list.filter(a => a !== action)
        : [...list, action]
      return { ...prev, [role]: next }
    })
  }

  const saveActions = async () => {
    if (!token) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/role-permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ config: actionConfig }),
      })
      const data = await res.json()
      if (data.success) {
        setMessage({ type: 'success', text: '操作权限保存成功' })
        setIsActionCustomized(true)
      } else {
        setMessage({ type: 'error', text: data.error || '保存失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '网络错误' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-500">加载角色配置...</span>
      </div>
    )
  }

  const totalMenuCount = CATEGORY_GROUPS.reduce((s, g) => s + g.menuIds.length, 0)
  const totalActionCount = ACTIONS.length

  return (
    <>
      {/* 标题 */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/dashboard" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <Shield className="w-6 h-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">角色与权限</h1>
      </div>

      {/* 提示 */}
      <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-medium mb-1">配置说明</p>
          <p>两个 tab 分别配置两类权限:<b>菜单权限</b>(能访问哪些页面) + <b>操作权限</b>(能做什么操作)。</p>
          <p className="mt-1 text-xs text-blue-600">保存后 <b>立即生效</b>(当前登录的 admin 需要刷新页面)。</p>
        </div>
      </div>

      {/* 消息提示 */}
      {message && (
        <div className={`mb-4 flex items-center gap-2 px-4 py-3 rounded-lg ${
          message.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span className="text-sm">{message.text}</span>
        </div>
      )}

      {/* v68:2 大 tab */}
      <div className="mb-4 border-b border-gray-200">
        <nav className="flex gap-1 -mb-px" aria-label="权限大类">
          <button
            type="button"
            onClick={() => setTopTab('menu')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              topTab === 'menu'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <LayoutGrid className={`w-4 h-4 ${topTab === 'menu' ? 'text-blue-500' : 'text-gray-400'}`} />
            菜单权限
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              topTab === 'menu' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {isMenuCustomized ? '🟢 已自定义' : '⚪ 默认'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTopTab('action')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              topTab === 'action'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <KeyRound className={`w-4 h-4 ${topTab === 'action' ? 'text-blue-500' : 'text-gray-400'}`} />
            操作权限
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              topTab === 'action' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {isActionCustomized ? '🟢 已自定义' : '⚪ 默认'}
            </span>
          </button>
        </nav>
      </div>

      {/* ===== 菜单权限 tab ===== */}
      {topTab === 'menu' && (
        <>
          {/* 角色 tab 切换 */}
          <div className="mb-4 border-b border-gray-200">
            <nav className="flex flex-wrap gap-1 -mb-px" aria-label="角色切换">
              {Object.keys(ROLE_LABELS).map(role => {
                const selectedIds = new Set(menuConfig[role] || [])
                const isActive = activeRole === role
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setActiveRole(role)}
                    className={`group inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                      isActive
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Shield className={`w-4 h-4 ${isActive ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'}`} />
                    {ROLE_LABELS[role]}
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      isActive ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {selectedIds.size}/{totalMenuCount}
                    </span>
                  </button>
                )
              })}
            </nav>
          </div>

          {/* 当前激活角色的菜单卡片 */}
          {activeRole && (() => {
            const role = activeRole
            const selectedIds = new Set(menuConfig[role] || [])
            return (
              <div className="bg-white rounded-xl shadow-lg p-5 border border-gray-100">
                <div className="flex items-start justify-between mb-4 pb-3 border-b border-gray-100">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-blue-500" />
                      {ROLE_LABELS[role]}
                      <code className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded font-mono">
                        {role}
                      </code>
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">{ROLE_DESCRIPTIONS[role]}</p>
                  </div>
                  <span className="text-xs text-gray-400">
                    已勾选 {selectedIds.size} / {totalMenuCount} 项
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {CATEGORY_GROUPS.map(group => {
                    const groupIds = group.menuIds
                    const groupSelected = groupIds.filter(id => selectedIds.has(id))
                    const allOn = groupSelected.length === groupIds.length
                    return (
                      <div key={group.name} className="border border-gray-200 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700">{group.name}</span>
                          <button
                            type="button"
                            onClick={() => toggleMenuGroup(role, groupIds, allOn)}
                            className={`text-xs px-2 py-0.5 rounded transition-colors ${
                              allOn
                                ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                          >
                            {allOn ? '取消全选' : '全选'}
                          </button>
                        </div>
                        <div className="space-y-1.5">
                          {groupIds.map(menuId => {
                            const menu = menuItems.find(m => m.id === menuId)
                            const checked = selectedIds.has(menuId)
                            return (
                              <label
                                key={menuId}
                                className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleMenu(role, menuId)}
                                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                />
                                <span className={`text-sm ${checked ? 'text-gray-900' : 'text-gray-500'}`}>
                                  {menu?.name || menuId}
                                </span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* 底部保存按钮 */}
          <div className="mt-6 flex items-center justify-end gap-3 sticky bottom-0 bg-white/80 backdrop-blur p-4 border-t border-gray-200 rounded-b-xl">
            <button
              onClick={load}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm flex items-center gap-1.5"
            >
              <RefreshCw className="w-4 h-4" />
              重新加载
            </button>
            <button
              onClick={saveMenus}
              disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              保存菜单权限
            </button>
          </div>
        </>
      )}

      {/* ===== 操作权限 tab ===== */}
      {topTab === 'action' && (
        <>
          <div className="space-y-4">
            {Object.keys(ROLE_LABELS).map(role => {
              const selectedActions = new Set(actionConfig[role] || [])
              return (
                <div key={role} className="bg-white rounded-xl shadow-lg p-5 border border-gray-100">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <Shield className="w-4 h-4 text-blue-500" />
                        {ROLE_LABELS[role]}
                        <code className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded font-mono">
                          {role}
                        </code>
                      </h2>
                      <p className="text-sm text-gray-500 mt-1">{ROLE_DESCRIPTIONS[role]}</p>
                    </div>
                    <span className="text-xs text-gray-400">
                      已勾选 {selectedActions.size} / {totalActionCount} 项
                    </span>
                  </div>

                  <div className="grid grid-cols-5 gap-3">
                    {ACTIONS.map(action => {
                      const checked = selectedActions.has(action)
                      return (
                        <label
                          key={action}
                          className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                            checked
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAction(role, action)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                          />
                          <span className={`text-sm font-medium ${checked ? 'text-blue-700' : 'text-gray-700'}`}>
                            {ACTION_LABELS[action]}
                          </span>
                          <span className="text-xs text-gray-500">{ACTION_DESCRIPTIONS[action]}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* 底部保存按钮 */}
          <div className="mt-6 flex items-center justify-end gap-3 sticky bottom-0 bg-white/80 backdrop-blur p-4 border-t border-gray-200 rounded-b-xl">
            <button
              onClick={load}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm flex items-center gap-1.5"
            >
              <RefreshCw className="w-4 h-4" />
              重新加载
            </button>
            <button
              onClick={saveActions}
              disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              保存操作权限
            </button>
          </div>
        </>
      )}
    </>
  )
}
