'use client'
import { useState, useEffect } from 'react'

interface Parameter {
  key: string; value: number
  def: { defaultValue: number; min: number; max: number; description: string; unit: string }
}

export default function SystemParametersPage() {
  const [params, setParams] = useState<Parameter[]>([])
  const [editing, setEditing] = useState<Record<string, string>>({})
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

  const save = async (key: string) => {
    setSaving(key)
    setMessage(null)
    try {
      const token = localStorage.getItem('token')
      const r = await fetch('/api/admin/system-config/parameters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key, value: Number(editing[key]) }),
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

  const UNIT_LABELS: Record<string, string> = {
    days: '天',
    hours: '小时',
    minutes: '分钟',
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">系统参数配置</h1>
      <p className="text-sm text-gray-500 mb-6">修改后立即生效，请谨慎操作</p>

      {message && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {params.map(p => (
          <div key={p.key} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="text-xs text-gray-400 font-mono mb-1">{p.key}</div>
            <div className="text-base font-medium text-gray-900">{p.def.description}</div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-bold text-orange-600">{p.value}</span>
              <span className="text-sm text-gray-500">{UNIT_LABELS[p.def.unit] || p.def.unit}</span>
            </div>
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <input
                type="number"
                step={p.def.min < 1 ? '0.001' : '1'}
                min={p.def.min}
                max={p.def.max}
                value={editing[p.key] ?? p.value}
                onChange={e => setEditing({ ...editing, [p.key]: e.target.value })}
                className="border border-gray-300 rounded-lg px-3 py-2 w-28 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
              <span className="text-xs text-gray-400">({p.def.min} - {p.def.max} {UNIT_LABELS[p.def.unit] || p.def.unit})</span>
              <button
                onClick={() => save(p.key)}
                disabled={saving === p.key}
                className="ml-auto bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50 transition-colors"
              >
                {saving === p.key ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}