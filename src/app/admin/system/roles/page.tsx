'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Shield, Loader2, Save, AlertCircle, CheckCircle, ChevronLeft, RefreshCw,
} from 'lucide-react'

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

export default function RolesPage() {
  const [token, setToken] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isCustomized, setIsCustomized] = useState(false)

  // config: { role -> menuIds[] }
  const [config, setConfig] = useState<Record<string, string[]>>({})
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])

  useEffect(() => {
    const t = typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''
    setToken(t)
  }, [])

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/roles', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data: ApiResponse = await res.json()
      if (data.success && data.data) {
        setConfig(data.data.config)
        setMenuItems(data.data.menuItems)
        setIsCustomized(data.data.isCustomized)
      } else {
        setMessage({ type: 'error', text: data.error || '加载失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '网络错误' })
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  const toggleMenu = (role: string, menuId: string) => {
    setConfig(prev => {
      const list = prev[role] || []
      const next = list.includes(menuId)
        ? list.filter(id => id !== menuId)
        : [...list, menuId]
      return { ...prev, [role]: next }
    })
  }

  const toggleGroup = (role: string, menuIds: string[], allOn: boolean) => {
    setConfig(prev => {
      const list = prev[role] || []
      const next = allOn
        ? list.filter(id => !menuIds.includes(id))
        : Array.from(new Set([...list, ...menuIds]))
      return { ...prev, [role]: next }
    })
  }

  const save = async () => {
    if (!token) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ config }),
      })
      const data = await res.json()
      if (data.success) {
        setMessage({ type: 'success', text: '保存成功,菜单已立即生效' })
        setIsCustomized(true)
      } else {
        setMessage({ type: 'error', text: data.error || '保存失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '网络错误' })
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    if (!confirm('重置为默认配置?会清空所有自定义权限。')) return
    // 重置 = 重新加载(后端会读 DB 旧值,如果有的话)
    // 真要重置默认,需要后端支持 DELETE 方法
    load()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-500">加载角色配置...</span>
      </div>
    )
  }

  return (
    <>
      {/* 标题 */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/dashboard" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <Shield className="w-6 h-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">角色与权限</h1>
        <span className="ml-auto text-xs text-gray-500">
          {isCustomized ? '🟢 已自定义' : '⚪ 使用默认配置'}
        </span>
      </div>

      {/* 提示 */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-medium mb-1">配置说明</p>
          <p>勾选每个角色能访问的菜单大类。保存后 <b>立即生效</b>(当前登录的 admin 需要刷新页面)。</p>
          <p className="mt-1 text-xs text-blue-600">建议:每个角色至少勾选"数据中台"作为首页入口。</p>
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

      {/* 角色卡片 */}
      <div className="space-y-4">
        {Object.keys(ROLE_LABELS).map(role => {
          const selectedIds = new Set(config[role] || [])
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
                  已勾选 {selectedIds.size} / {CATEGORY_GROUPS.reduce((s, g) => s + g.menuIds.length, 0)} 项
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {CATEGORY_GROUPS.map(group => {
                  const groupIds = group.menuIds
                  const groupSelected = groupIds.filter(id => selectedIds.has(id))
                  const allOn = groupSelected.length === groupIds.length
                  const someOn = groupSelected.length > 0 && !allOn
                  return (
                    <div key={group.name} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">{group.name}</span>
                        <button
                          type="button"
                          onClick={() => toggleGroup(role, groupIds, allOn)}
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
                              {someOn && !checked && groupIds.includes(menuId) && groupSelected.includes(menuId) === false && (
                                <span className="text-xs text-gray-400">({groupSelected.length}/{groupIds.length})</span>
                              )}
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
        })}
      </div>

      {/* 底部操作栏 */}
      <div className="mt-6 flex items-center justify-end gap-3 sticky bottom-0 bg-white/80 backdrop-blur p-4 border-t border-gray-200 rounded-b-xl">
        <button
          onClick={reset}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm flex items-center gap-1.5"
        >
          <RefreshCw className="w-4 h-4" />
          重新加载
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm flex items-center gap-1.5 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          保存配置
        </button>
      </div>
    </>
  )
}
