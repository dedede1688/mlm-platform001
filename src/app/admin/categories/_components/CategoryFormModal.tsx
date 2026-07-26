'use client'

import { Loader2, Save } from 'lucide-react'

interface FormData {
  name: string
  sortOrder: string
  parentId: string | null
}

interface CategoryItem {
  id: string
  name: string
  sortOrder: number
  parentId: string | null
}

interface CategoryFormModalProps {
  editingId: string | null
  formData: FormData
  saving: boolean
  categories: CategoryItem[]
  getCategoryPath: (id: string) => string
  onClose: () => void
  onSave: () => void
  onFormDataChange: (updater: (prev: FormData) => FormData) => void
}

export default function CategoryFormModal({
  editingId,
  formData,
  saving,
  categories,
  getCategoryPath,
  onClose,
  onSave,
  onFormDataChange,
}: CategoryFormModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">
          {editingId ? '编辑分类' : formData.parentId ? '添加子分类' : '添加根分类'}
        </h2>

        {formData.parentId && (
          <div className="mb-4 p-2 bg-blue-50 rounded-lg text-sm text-blue-700">
            父分类：{getCategoryPath(formData.parentId)}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              分类名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={e => onFormDataChange(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                transition-colors text-gray-900 text-sm"
              placeholder="请输入分类名称"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">排序值</label>
            <input
              type="number"
              value={formData.sortOrder}
              onChange={e => onFormDataChange(prev => ({ ...prev, sortOrder: e.target.value }))}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                transition-colors text-gray-900 text-sm"
              placeholder="0"
            />
            <p className="mt-1 text-xs text-gray-400">数字越小排越前</p>
          </div>

          {/* 编辑模式下可修改父分类 */}
          {editingId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">父分类</label>
              <select
                value={formData.parentId || '__root__'}
                onChange={e => {
                  const val = e.target.value
                  onFormDataChange(prev => ({
                    ...prev,
                    parentId: val === '__root__' ? null : val,
                  }))
                }}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                  focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                  transition-colors text-gray-900 text-sm bg-white"
              >
                <option value="__root__">无（根分类）</option>
                {categories
                  .filter(c => c.id !== editingId)
                  .map(c => (
                    <option key={c.id} value={c.id}>
                      {getCategoryPath(c.id)}
                    </option>
                  ))
                }
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm"
          >
            取消
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg
              hover:bg-blue-700 transition-colors font-medium text-sm
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
