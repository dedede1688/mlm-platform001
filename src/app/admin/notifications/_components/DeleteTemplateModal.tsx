'use client'

import { AlertCircle } from 'lucide-react'

interface DeleteTemplateModalProps {
  onCancel: () => void
  onConfirm: () => void
}

export default function DeleteTemplateModal({
  onCancel,
  onConfirm,
}: DeleteTemplateModalProps) {
  return (
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
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors text-sm"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
          >
            确认删除
          </button>
        </div>
      </div>
    </div>
  )
}
