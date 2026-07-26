'use client'

import { X, Loader2 } from 'lucide-react'

interface SendNotificationModalProps {
  sendType: 'general' | 'announcement'
  sendUserIds: string
  sendSubject: string
  sendContent: string
  sending: boolean
  onClose: () => void
  onSendTypeChange: (type: 'general' | 'announcement') => void
  onSendUserIdsChange: (value: string) => void
  onSendSubjectChange: (value: string) => void
  onSendContentChange: (value: string) => void
  onSend: () => void
}

export default function SendNotificationModal({
  sendType,
  sendUserIds,
  sendSubject,
  sendContent,
  sending,
  onClose,
  onSendTypeChange,
  onSendUserIdsChange,
  onSendSubjectChange,
  onSendContentChange,
  onSend,
}: SendNotificationModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">发送通知</h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">通知类型</label>
            <select value={sendType} onChange={e => onSendTypeChange(e.target.value as 'general' | 'announcement')} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900">
              <option value="general">通用通知（指定收件人）</option>
              <option value="announcement">系统公告（全员）</option>
            </select>
          </div>
          {sendType === 'general' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">收件人用户ID（每行一个）</label>
              <textarea value={sendUserIds} onChange={e => onSendUserIdsChange(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 resize-none font-mono text-sm" rows={3} placeholder="每行一个 UUID（例如：c5b3f7e2-1234-5678-9abc-def012345678），用换行或逗号分隔。可到 /admin/users 查看真实 userId。" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">标题（选填）</label>
            <input type="text" value={sendSubject} onChange={e => onSendSubjectChange(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" placeholder="通知标题" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">通知内容 <span className="text-red-500">*</span></label>
            <textarea value={sendContent} onChange={e => onSendContentChange(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 resize-none" rows={4} placeholder="通知正文" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">取消</button>
          <button onClick={onSend} disabled={sending} className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50 transition-colors">
            {sending && <Loader2 className="w-4 h-4 animate-spin" />} 发送
          </button>
        </div>
      </div>
    </div>
  )
}
