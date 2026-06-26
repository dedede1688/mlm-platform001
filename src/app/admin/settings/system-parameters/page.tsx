'use client'
import { useState, useEffect } from 'react'

// v50 C: 扩展支持 boolean 类型 + 分组
interface SystemParameterDef {
  type: 'number' | 'boolean'
  defaultValue: number | boolean
  min?: number
  max?: number
  description: string
  unit: string
  group: string
}

interface Parameter {
  key: string
  value: number | boolean
  def: SystemParameterDef
}

const GROUP_LABELS: Record<string, string> = {
  time: '⏰ 时间参数',
  reward: '🎁 奖励配置',
  dividend: '💰 分红配置',
  upgrade: '⬆️ 升级门槛',
  feature: '🔧 功能开关',
  points: '🪙 积分设置',
  withdrawal: '💳 提现设置',
}

const UNIT_LABELS: Record<string, string> = {
  days: '天',
  hours: '小时',
  minutes: '分钟',
  '比例': '',
  '%': '%',
  '箱': '箱',
  '积分': '积分',
  '元': '元',
  '次': '次',
  '-': '',
}

export default function SystemParametersPage() {
  const [params, setParams] = useState<Parameter[]>([])
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [editingBool, setEditingBool] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const load = async () => {
    try {
      const token = localStorage.getItem('token')
      const r = await fetch('/api/admin/system-config/parameters', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const d = await r.json()
      if (d.success) setParams(d.data.parameters)
    } catch (_error) {
      setMessage({ type: 'error', text: '加载失败' })
    }
  }
  useEffect(() => { load() }, [])

  // v50 C: save 支持 number + boolean
  const save = async (key: string, type: 'number' | 'boolean') => {
    setSaving(key)
    setMessage(null)
    try {
      const token = localStorage.getItem('token')
      let value: number | boolean
      if (type === 'boolean') {
        value = editingBool[key] ?? false
      } else {
        value = Number(editing[key])
      }
      const r = await fetch('/api/admin/system-config/parameters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key, value }),
      })
      const d = await r.json()
      if (d.success) {
        await load()
        setMessage({ type: 'success', text: '更新成功' })
      } else {
        setMessage({ type: 'error', text: d.message || d.error || '更新失败' })
      }
    } catch (_error) {
      setMessage({ type: 'error', text: '网络错误' })
    } finally {
      setSaving(null)
    }
  }

  // 按 group 分组
  const grouped = params.reduce((acc, p) => {
    const g = p.def.group || 'other'
    if (!acc[g]) acc[g] = []
    acc[g].push(p)
    return acc
  }, {} as Record<string, Parameter[]>)

  // 保持分组顺序
  const groupOrder: string[] = ['time', 'reward', 'dividend', 'upgrade', 'feature', 'points', 'withdrawal']

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">系统参数配置</h1>
      <p className="text-sm text-gray-500 mb-6">修改后立即生效，请谨慎操作 · 共 {params.length} 项参数</p>

      {message && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {groupOrder.map(group => {
        const items = grouped[group]
        if (!items || items.length === 0) return null
        return (
          <div key={group} className="mb-8">
            <h2 className="text-lg font-semibold text-gray-800 mb-3 pb-2 border-b border-gray-200">
              {GROUP_LABELS[group] || group}
              <span className="ml-2 text-sm font-normal text-gray-400">({items.length} 项)</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {items.map(p => (
                <div key={p.key} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                  <div className="text-xs text-gray-400 font-mono mb-1">{p.key}</div>
                  <div className="text-base font-medium text-gray-900">{p.def.description}</div>

                  {p.def.type === 'boolean' ? (
                    // v50 C: boolean 用 checkbox/toggle
                    <div className="mt-3 flex items-center gap-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        p.value ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {p.value ? '已开启' : '已关闭'}
                      </span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editingBool[p.key] ?? (p.value as boolean)}
                          onChange={e => setEditingBool({ ...editingBool, [p.key]: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                      </label>
                      <button
                        onClick={() => save(p.key, 'boolean')}
                        disabled={saving === p.key}
                        className="ml-auto bg-orange-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50 transition-colors"
                      >
                        {saving === p.key ? '保存中...' : '保存'}
                      </button>
                    </div>
                  ) : (
                    // number 用 input
                    <>
                      <div className="mt-3 flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-orange-600">{p.value}</span>
                        <span className="text-sm text-gray-500">{UNIT_LABELS[p.def.unit] || p.def.unit}</span>
                      </div>
                      <div className="mt-4 flex items-center gap-2 flex-wrap">
                        <input
                          type="number"
                          step={p.def.min !== undefined && p.def.min < 1 ? '0.001' : '1'}
                          min={p.def.min}
                          max={p.def.max}
                          value={editing[p.key] ?? String(p.value)}
                          onChange={e => setEditing({ ...editing, [p.key]: e.target.value })}
                          className="border border-gray-300 rounded-lg px-3 py-2 w-28 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        />
                        {p.def.min !== undefined && p.def.max !== undefined && (
                          <span className="text-xs text-gray-400">
                            ({p.def.min} - {p.def.max} {UNIT_LABELS[p.def.unit] || p.def.unit})
                          </span>
                        )}
                        <button
                          onClick={() => save(p.key, 'number')}
                          disabled={saving === p.key}
                          className="ml-auto bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50 transition-colors"
                        >
                          {saving === p.key ? '保存中...' : '保存'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
