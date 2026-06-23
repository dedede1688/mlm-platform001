'use client'

import { useState, useEffect } from 'react'
import { FileText, Plus, Pencil, Trash2, X, Loader2, CheckCircle, XCircle } from 'lucide-react'

interface Template {
  id: string
  title: string
  content: string
  sortOrder: number
  isEnabled: boolean
}

export default function WithdrawalTemplatesPage() {
  const [token, setToken] = useState<string | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [editModal, setEditModal] = useState<Template | null>(null)
  const [createModal, setCreateModal] = useState(false)
  const [form, setForm] = useState({ title: '', content: '', sortOrder: 0, isEnabled: true })
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    const t = localStorage.getItem('token')
    if (t) { setToken(t); fetchTemplates(t) }
  }, [])

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const fetchTemplates = async (authToken: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/withdrawal-templates', { headers: { Authorization: `Bearer ${authToken}` } })
      const data = await res.json()
      if (data.success) setTemplates(data.data || [])
    } catch { showMessage('error', '获取模板失败') }
    finally { setLoading(false) }
  }

  const handleSave = async () => {
    if (!token) return
    if (!form.title.trim() || !form.content.trim()) { showMessage('error', '标题和内容不能为空'); return }
    setSubmitting(true)
    try {
      const isEdit = !!editModal
      const url = isEdit ? `/api/admin/withdrawal-templates/${editModal!.id}` : '/api/admin/withdrawal-templates'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (data.success) {
        showMessage('success', isEdit ? '更新成功' : '创建成功')
        setEditModal(null)
        setCreateModal(false)
        setForm({ title: '', content: '', sortOrder: 0, isEnabled: true })
        fetchTemplates(token)
      } else { showMessage('error', data.message || '操作失败') }
    } catch { showMessage('error', '网络错误') }
    finally { setSubmitting(false) }
  }

  const handleDelete = async (id: string) => {
    if (!token || !confirm('确认删除此模板？')) return
    try {
      const res = await fetch(`/api/admin/withdrawal-templates/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) { showMessage('success', '删除成功'); fetchTemplates(token) }
      else { showMessage('error', data.message || '删除失败') }
    } catch { showMessage('error', '网络错误') }
  }

  const openEdit = (t: Template) => {
    setEditModal(t)
    setForm({ title: t.title, content: t.content, sortOrder: t.sortOrder, isEnabled: t.isEnabled })
  }

  const closeModal = () => { setEditModal(null); setCreateModal(false); setForm({ title: '', content: '', sortOrder: 0, isEnabled: true }) }

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <FileText className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold text-gray-900">拒绝理由模板</h1>
        <button onClick={() => setCreateModal(true)} className="ml-auto inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm text-sm">
          <Plus className="w-4 h-4" /> 新建模板
        </button>
      </div>

      {message && (
        <div className={`mb-6 flex items-center gap-2 px-4 py-3 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.type === 'success' ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <XCircle className="w-5 h-5 flex-shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /><span className="ml-2 text-gray-500">加载中...</span></div>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center text-gray-400">暂无模板，点击右上角新建</div>
      ) : (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">标题</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">内容</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">排序</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">状态</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {templates.map(t => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-900 font-medium">{t.title}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{t.content}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{t.sortOrder}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${t.isEnabled ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {t.isEnabled ? '启用' : '禁用'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(t)} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors font-medium">
                        <Pencil className="w-3.5 h-3.5" /> 编辑
                      </button>
                      <button onClick={() => handleDelete(t.id)} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium">
                        <Trash2 className="w-3.5 h-3.5" /> 删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 创建/编辑弹窗 */}
      {(createModal || editModal) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{editModal ? '编辑模板' : '新建模板'}</h3>
              <button onClick={closeModal} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">标题 <span className="text-red-500">*</span></label>
                <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900" placeholder="模板标题" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">内容 <span className="text-red-500">*</span></label>
                <textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 resize-none" rows={3} placeholder="拒绝理由内容" />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">排序</label>
                  <input type="number" value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">状态</label>
                  <select value={form.isEnabled ? '1' : '0'} onChange={e => setForm({ ...form, isEnabled: e.target.value === '1' })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900">
                    <option value="1">启用</option>
                    <option value="0">禁用</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={closeModal} className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">取消</button>
              <button onClick={handleSave} disabled={submitting} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 transition-colors">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />} 保存
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}