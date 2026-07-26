'use client'

import { X, Mail, MessageSquare, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react'

// ---- duplicated constants (same as parent) ----

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

// ---- types ----

interface FormData {
  type: string
  channel: string
  subject: string
  content: string
  enabled: boolean
}

// ---- props ----

interface TemplateFormModalProps {
  editingId: string | null
  formData: FormData
  saving: boolean
  availableVariables: Array<{ key: string; label: string }>
  onClose: () => void
  onSave: () => void
  onInsertVariable: (variable: string) => void
  onFormDataChange: (updater: (prev: FormData) => FormData) => void
}

export default function TemplateFormModal({
  editingId,
  formData,
  saving,
  availableVariables,
  onClose,
  onSave,
  onInsertVariable,
  onFormDataChange,
}: TemplateFormModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {editingId ? '编辑模板' : '添加模板'}
          </h2>
          <button
            onClick={onClose}
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
              onChange={(e) => onFormDataChange((prev) => ({ ...prev, type: e.target.value }))}
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
              onChange={(e) => onFormDataChange((prev) => ({ ...prev, channel: e.target.value }))}
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
                onChange={(e) => onFormDataChange((prev) => ({ ...prev, subject: e.target.value }))}
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
                    key={v.key}
                    type="button"
                    onClick={() => onInsertVariable(v.key)}
                    title={v.label}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-700
                      rounded-md text-xs font-mono hover:bg-blue-50 hover:text-blue-700
                      transition-colors border border-gray-200"
                  >
                    <span>{v.key}</span>
                    <span className="text-gray-400 font-sans text-[10px]">（{v.label}）</span>
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
              onChange={(e) => onFormDataChange((prev) => ({ ...prev, content: e.target.value }))}
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
              onClick={() => onFormDataChange((prev) => ({ ...prev, enabled: !prev.enabled }))}
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
            onClick={onClose}
            className="px-5 py-2.5 text-gray-600 hover:text-gray-800 transition-colors text-sm font-medium"
          >
            取消
          </button>
          <button
            onClick={onSave}
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
  )
}
