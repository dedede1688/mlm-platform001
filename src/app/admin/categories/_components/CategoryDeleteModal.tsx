'use client'

import { Loader2, Trash2 } from 'lucide-react'

interface CategoryDeleteModalProps {
  categoryName: string
  deleting: boolean
  onCancel: () => void
  onConfirm: () => void
}

export default function CategoryDeleteModal({
  categoryName,
  deleting,
  onCancel,
  onConfirm,
}: CategoryDeleteModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-2">确认删除</h2>
        <p className="text-sm text-gray-600 mb-4">
          确定要删除分类「{categoryName}」吗？
          如果该分类下有子分类或商品，将无法删除。
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg
              hover:bg-red-700 transition-colors font-medium text-sm
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            删除
          </button>
        </div>
      </div>
    </div>
  )
}
