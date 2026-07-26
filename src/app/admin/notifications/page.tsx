'use client'

import { useState, useEffect } from 'react'
import {
  Bell, Plus, Edit2, Trash2, CheckCircle, AlertCircle,
  Loader2, X, Mail, MessageSquare, ToggleLeft, ToggleRight, Send
} from 'lucide-react'
import TemplateFormModal from './_components/TemplateFormModal'
import DeleteTemplateModal from './_components/DeleteTemplateModal'
import SendNotificationModal from './_components/SendNotificationModal'
import { getAuthToken } from '@/lib/utils/auth-token'

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
  { value: 'general', label: '通用通知' },
  { value: 'announcement', label: '系统公告' },
] as const

const CHANNELS = [
  { value: 'email', label: '邮件' },
  { value: 'sms', label: '短信' },
  { value: 'in_app', label: '站内信' },
] as const

// 每种模板类型可用的变量
const TYPE_VARIABLES: Record<string, Array<{ key: string; label: string }>> = {
  order_paid: [
    { key: '{{orderNo}}', label: '订单号' },
    { key: '{{orderAmount}}', label: '订单总金额' },
    { key: '{{payAmount}}', label: '实付金额' },
    { key: '{{userName}}', label: '用户姓名' },
  ],
  order_shipped: [
    { key: '{{orderNo}}', label: '订单号' },
    { key: '{{trackingNumber}}', label: '物流单号' },
    { key: '{{userName}}', label: '用户姓名' },
  ],
  order_completed: [
    { key: '{{orderNo}}', label: '订单号' },
    { key: '{{userName}}', label: '用户姓名' },
  ],
  order_cancelled: [
    { key: '{{orderNo}}', label: '订单号' },
    { key: '{{reason}}', label: '取消原因' },
    { key: '{{userName}}', label: '用户姓名' },
  ],
  register_verify: [
    { key: '{{userName}}', label: '用户姓名' },
    { key: '{{verifyCode}}', label: '验证码' },
    { key: '{{expireMinutes}}', label: '过期分钟数' },
  ],
  password_reset: [
    { key: '{{userName}}', label: '用户姓名' },
    { key: '{{resetLink}}', label: '重置链接' },
    { key: '{{expireMinutes}}', label: '过期分钟数' },
  ],
  withdrawal_result: [
    { key: '{{userName}}', label: '用户姓名' },
    { key: '{{amount}}', label: '提现金额' },
    { key: '{{status}}', label: '审核结果' },
    { key: '{{reason}}', label: '通用原因' },
    { key: '{{rejectReason}}', label: '拒绝原因' },
  ],
  general: [
    { key: '{{userName}}', label: '用户姓名' },
    { key: '{{content}}', label: '消息正文' },
  ],
  announcement: [
    { key: '{{content}}', label: '公告内容' },
  ],
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

  // 发送通知
  const [showSend, setShowSend] = useState(false)
  const [sendType, setSendType] = useState<'general' | 'announcement'>('general')
  const [sendUserIds, setSendUserIds] = useState('')
  const [sendSubject, setSendSubject] = useState('')
  const [sendContent, setSendContent] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    fetchTemplates()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTemplates = async () => {
    try {
      const token = getAuthToken()
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
      const token = getAuthToken()
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
      const token = getAuthToken()
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
      const token = getAuthToken()
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

  const handleSend = async () => {
    if (!sendContent.trim()) { setMessage({ type: 'error', text: '内容不能为空' }); return }
    if (sendType === 'general' && !sendUserIds.trim()) { setMessage({ type: 'error', text: '通用通知必须指定收件人' }); return }
    setSending(true)
    try {
      const body: Record<string, unknown> = { type: sendType, content: sendContent.trim() }
      if (sendSubject.trim()) body.subject = sendSubject.trim()
      if (sendType === 'general') {
        body.userIds = sendUserIds.split(/[\n,]/).map(s => s.trim()).filter(Boolean)
      }
      const res = await fetch('/api/admin/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success) {
        setMessage({ type: 'success', text: `通知已发送，共 ${data.data.count} 条` })
        setShowSend(false)
        setSendContent('')
        setSendUserIds('')
        setSendSubject('')
      } else {
        setMessage({ type: 'error', text: data.error || '发送失败' })
      }
    } catch { setMessage({ type: 'error', text: '网络错误' }) }
    finally { setSending(false); setTimeout(() => setMessage(null), 3000) }
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
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSend(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg
              hover:bg-green-700 transition-colors font-medium text-sm"
          >
            <Send className="w-4 h-4" />
            发送通知
          </button>
          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg
              hover:bg-blue-700 transition-colors font-medium text-sm"
          >
            <Plus className="w-4 h-4" />
            添加模板
          </button>
        </div>
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
        <TemplateFormModal
          editingId={editingId}
          formData={formData}
          saving={saving}
          availableVariables={availableVariables}
          onClose={handleCloseForm}
          onSave={handleSave}
          onInsertVariable={handleInsertVariable}
          onFormDataChange={setFormData}
        />
      )}

      {/* 删除确认弹窗 */}
      {deletingId && (
        <DeleteTemplateModal
          onCancel={() => setDeletingId(null)}
          onConfirm={handleDelete}
        />
      )}

      {/* 发送通知弹窗 */}
      {showSend && (
        <SendNotificationModal
          sendType={sendType}
          sendUserIds={sendUserIds}
          sendSubject={sendSubject}
          sendContent={sendContent}
          sending={sending}
          onClose={() => setShowSend(false)}
          onSendTypeChange={setSendType}
          onSendUserIdsChange={setSendUserIds}
          onSendSubjectChange={setSendSubject}
          onSendContentChange={setSendContent}
          onSend={handleSend}
        />
      )}
    </>
  )
}