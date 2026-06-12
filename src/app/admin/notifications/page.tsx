'use client'

import { useState, useEffect } from 'react'
import {
  Bell, Plus, Edit2, Trash2, CheckCircle, AlertCircle,
  Loader2, X, Mail, MessageSquare, ToggleLeft, ToggleRight
} from 'lucide-react'

// ---- 类型 ----

interface NotificationTemplate {
  id: string
  type: string
  channel: string
  subject: string | null
  content: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

interface FormData {
  type: string
  channel: string
  subject: string
  content: string
  enabled: boolean
}

// ---- 常量 ----

const TEMPLATE_TYPES = [
  { value: 'order_paid', label: '订单支付成功' },
  { value: 'order_shipped', label: '订单已发货' },
  { value: 'order_completed', label: '订单已完成' },
  { value: 'order_cancelled', label: '订单已取消' },
  { value: 'register_verify', label: '注册验证码' },
  { value: 'password_reset', label: '密码重置' },
  { value: 'withdrawal_result', label: '提现审核结果' },
] as const

const CHANNELS = [
  { value: 'email', label: '邮件' },
  { value: 'sms', label: '短信' },
] as const

// 每种模板类型可用的变量
const TYPE_VARIABLES: Record<string, string[]> = {
  order_paid: ['{{orderNo}}', '{{orderAmount}}', '{{payAmount}}', '{{userName}}'],
  order_shipped: ['{{orderNo}}', '{{trackingNumber}}', '{{userName}}'],
  order_completed: ['{{orderNo}}', '{{userName}}'],
  order_cancelled: ['{{orderNo}}', '{{reason}}', '{{userName}}'],
  register_verify: ['{{userName}}', '{{verifyCode}}', '{{expireMinutes}}'],
  password_reset: ['{{userName}}', '{{resetLink}}', '{{expireMinutes}}'],
  withdrawal_result: ['{{userName}}', '{{amount}}', '{{status}}', '{{reason}}'],
}

const defaultFormData: FormData = {
  type: '',
  channel: 'email',
  subject: '',
  content: '',
  enabled: true,
}

// ---- 辅助 ----

function getTypeLabel(type: string): string {
  return TEMPLATE_TYPES.find((t) => t.value === type)?.label ?? type
}

function getChannelLabel(channel: string): string {
  return CHANNELS.find((c) => c.value === channel)?.label ?? channel
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

// ---- 组件 ----

export default function AdminNotificationsPage() {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 编辑/新增表单
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(defaultFormData)
  const [saving, setSaving] = useState(false)

  // 删除确认
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    fetchTemplates()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTemplates = async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/admin/notifications', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401 || res.status === 403) {
        window.location.href = '/login'
        return
      }
      const data = await res.json()
      if (data.success) {
        setTemplates(data.data)
      }
    } catch (err) {
      console.error('获取通知模板失败:', err)
      setMessage({ type: 'error', text: '加载模板失败' })
    } finally {
      setLoading(false)
    }
  }

  const handleOpenAdd = () => {
    setEditingId(null)
    setFormData(defaultFormData)
    setShowForm(true)
  }

  const handleOpenEdit = (template: NotificationTemplate) => {
    setEditingId(template.id)
    setFormData({
      type: template.type,
      channel: template.channel,
      subject: template.subject ?? '',
      content: template.content,
      enabled: template.enabled,
    })
    setShowForm(true)
  }

  const handleCloseForm = () => {
    setShowForm(false)
    setEditingId(null)
    setFormData(defaultFormData)
  }

  const handleSave = async () => {
    if (!formData.type || !formData.content) {
      setMessage({ type: 'error', text: '类型和内容为必填项' })
      return
    }
    if (formData.channel === 'email' && !formData.subject) {
      setMessage({ type: 'error', text: '邮件模板必须填写主题' })
      return
    }

    setSaving(true)
    setMessage(null)
    try {
      const token = localStorage.getItem('token')
      const url = editingId
        ? `/api/admin/notifications/${editingId}`
        : '/api/admin/notifications'
      const method = editingId ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      })

      const data = await res.json()
      if (data.success) {
        setMessage({ type: 'success', text: editingId ? '模板已更新' : '模板已创建' })
        handleCloseForm()
        fetchTemplates()
      } else {
        setMessage({ type: 'error', text: data.error || '保存失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '网络错误' })
    } finally {
      setSaving(false)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const handleToggleEnabled = async (template: NotificationTemplate) => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/admin/notifications/${template.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled: !template.enabled }),
      })
      const data = await res.json()
      if (data.success) {
        fetchTemplates()
      } else {
        setMessage({ type: 'error', text: data.error || '操作失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '网络错误' })
    }
  }

  const handleDelete = async () => {
    if (!deletingId) return
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/admin/notifications/${deletingId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setMessage({ type: 'success', text: '模板已删除' })
        fetchTemplates()
      } else {
        setMessage({ type: 'error', text: data.error || '删除失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '网络错误' })
    } finally {
      setDeletingId(null)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const handleInsertVariable = (variable: string) => {
    setFormData((prev) => ({
      ...prev,
      content: prev.content + variable,
    }))
  }

  // 当前选中类型可用的变量
  const availableVariables = TYPE_VARIABLES[formData.type] ?? []

  // ---- 加载态 ----
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-400">加载中...</span>
      </div>
    )
  }

  return (
    <>
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold text-gray-900">通知模板管理</h1>
        </div>
        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg
            hover:bg-blue-700 transition-colors font-medium text-sm"
        >
          <Plus className="w-4 h-4" />
          添加模板
        </button>
      </div>

      {/* 消息提示 */}
      {message && (
        <div className={`mb-6 flex items-center gap-2 px-4 py-3 rounded-lg ${
          message.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.type === 'success'
            ? <CheckCircle className="w-5 h-5 flex-shrink-0" />
            : <AlertCircle className="w-5 h-5 flex-shrink-0" />
          }
          <span>{message.text}</span>
        </div>
      )}

      {/* 模板列表 */}
      {templates.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <Bell className="w-12 h-12 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-400 mb-4">暂无通知模板</p>
          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg
              hover:bg-blue-700 transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            创建第一个模板
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-5 py-3.5 text-left font-medium text-gray-500">类型</th>
                  <th className="px-5 py-3.5 text-left font-medium text-gray-500">渠道</th>
                  <th className="px-5 py-3.5 text-left font-medium text-gray-500 hidden sm:table-cell">主题</th>
                  <th className="px-5 py-3.5 text-left font-medium text-gray-500">状态</th>
                  <th className="px-5 py-3.5 text-left font-medium text-gray-500 hidden md:table-cell">更新时间</th>
                  <th className="px-5 py-3.5 text-right font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {templates.map((template) => (
                  <tr key={template.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4">
                      <span className="font-medium text-gray-900">{getTypeLabel(template.type)}</span>
                      <span className="text-xs text-gray-400 ml-2">{template.type}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                        template.channel === 'email'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-green-50 text-green-700'
                      }`}>
                        {template.channel === 'email'
                          ? <Mail className="w-3.5 h-3.5" />
                          : <MessageSquare className="w-3.5 h-3.5" />
                        }
                        {getChannelLabel(template.channel)}
                      </span>
                    </td>
                    <td className="px-5 py-4 hidden sm:table-cell">
                      <span className="text-gray-500 truncate block max-w-[200px]">
                        {template.subject || '-'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => handleToggleEnabled(template)}
                        className="inline-flex items-center gap-1.5"
                      >
                        {template.enabled ? (
                          <ToggleRight className="w-6 h-6 text-green-500" />
                        ) : (
                          <ToggleLeft className="w-6 h-6 text-gray-300" />
                        )}
                        <span className={`text-xs ${template.enabled ? 'text-green-600' : 'text-gray-400'}`}>
                          {template.enabled ? '启用' : '禁用'}
                        </span>
                      </button>
                    </td>
                    <td className="px-5 py-4 text-gray-400 text-xs hidden md:table-cell">
                      {formatDate(template.updatedAt)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEdit(template)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                          title="编辑"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingId(template.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400">
            共 {templates.length} 个模板
          </div>
        </div>
      )}

      {/* 新增/编辑弹窗 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingId ? '编辑模板' : '添加模板'}
              </h2>
              <button
                onClick={handleCloseForm}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* 类型 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  模板类型 <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData((prev) => ({ ...prev, type: e.target.value }))}
                  disabled={!!editingId}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    transition-colors text-gray-900 hover:border-gray-400
                    bg-white appearance-none disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">请选择模板类型</option>
                  {TEMPLATE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                {editingId && (
                  <p className="mt-1 text-xs text-gray-400">模板类型创建后不可修改</p>
                )}
              </div>

              {/* 渠道 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  通知渠道 <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.channel}
                  onChange={(e) => setFormData((prev) => ({ ...prev, channel: e.target.value }))}
                  disabled={!!editingId}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    transition-colors text-gray-900 hover:border-gray-400
                    bg-white appearance-none disabled:bg-gray-50 disabled:text-gray-400"
                >
                  {CHANNELS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* 邮件主题 */}
              {formData.channel === 'email' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    邮件主题 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.subject}
                    onChange={(e) => setFormData((prev) => ({ ...prev, subject: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                      focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                      transition-colors text-gray-900 placeholder-gray-400
                      hover:border-gray-400"
                    placeholder="如：您的订单已支付成功"
                  />
                  <p className="mt-1 text-xs text-gray-400">支持变量占位符，如 {'{{orderNo}}'}</p>
                </div>
              )}

              {/* 可用变量提示 */}
              {formData.type && availableVariables.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    可用变量（点击插入）
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {availableVariables.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => handleInsertVariable(v)}
                        className="inline-flex items-center px-2.5 py-1 bg-gray-100 text-gray-700
                          rounded-md text-xs font-mono hover:bg-blue-50 hover:text-blue-700
                          transition-colors border border-gray-200"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 模板内容 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  模板内容 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData((prev) => ({ ...prev, content: e.target.value }))}
                  rows={8}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    transition-colors text-gray-900 placeholder-gray-400
                    hover:border-gray-400 resize-y font-mono text-sm"
                  placeholder={formData.channel === 'email'
                    ? '请输入邮件内容（支持 HTML），使用 {{变量名}} 作为占位符'
                    : '请输入短信内容（纯文本），使用 {{变量名}} 作为占位符'
                  }
                />
                <p className="mt-1 text-xs text-gray-400">
                  {formData.channel === 'email'
                    ? '邮件内容支持 HTML 格式和变量占位符'
                    : '短信内容为纯文本，建议不超过 70 个字符'
                  }
                </p>
              </div>

              {/* 启用开关 */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <span className="text-sm font-medium text-gray-700">启用模板</span>
                  <p className="text-xs text-gray-400">禁用后不会触发该模板的通知</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, enabled: !prev.enabled }))}
                >
                  {formData.enabled ? (
                    <ToggleRight className="w-8 h-8 text-green-500" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-gray-300" />
                  )}
                </button>
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={handleCloseForm}
                className="px-5 py-2.5 text-gray-600 hover:text-gray-800 transition-colors text-sm font-medium"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-white font-medium text-sm transition-all ${
                  saving
                    ? 'bg-blue-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
                }`}
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">确认删除</h3>
                <p className="text-sm text-gray-500">此操作不可撤销</p>
              </div>
            </div>
            <p className="text-gray-600 mb-6">确定要删除此通知模板吗？</p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeletingId(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors text-sm"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}