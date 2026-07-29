'use client'
import { logger } from '@/lib/logger'

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, AlertCircle, Plus, FolderTree
} from 'lucide-react'
import CategoryFormModal from './_components/CategoryFormModal'
import CategoryDeleteModal from './_components/CategoryDeleteModal'
import CategoryTreeList from './_components/CategoryTreeList'
import { getAuthToken } from '@/lib/utils/auth-token'

// ---- 类型定义 ----

interface CategoryItem {
  id: string
  name: string
  parentId: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

interface TreeNode extends CategoryItem {
  children: TreeNode[]
}

interface FormData {
  name: string
  parentId: string | null
  sortOrder: string
}

const defaultForm: FormData = {
  name: '',
  parentId: null,
  sortOrder: '0',
}

// ---- 辅助函数：构建树 ----

function buildTree(items: CategoryItem[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  const roots: TreeNode[] = []

  // 先创建所有节点
  for (const item of items) {
    map.set(item.id, { ...item, children: [] })
  }

  // 再构建父子关系
  for (const item of items) {
    const node = map.get(item.id)!
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  // 递归排序
  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder)
    for (const node of nodes) {
      sortNodes(node.children)
    }
    return nodes
  }

  return sortNodes(roots)
}

// ---- 组件 ----

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [tree, setTree] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 弹窗
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(defaultForm)
  const [saving, setSaving] = useState(false)

  // 删除确认
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // 展开/折叠状态
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // 获取分类列表
  const fetchCategories = useCallback(async () => {
    try {
      const token = getAuthToken()
      const res = await fetch('/api/admin/categories', {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.status === 403 || res.status === 401) {
        window.location.href = '/login'
        return
      }

      const data = await res.json()
      if (data.success && data.data) {
        setCategories(data.data)
        setTree(buildTree(data.data))
      } else {
        setError(data.error || '获取分类失败')
      }
    } catch (err) {
      logger.error('获取分类失败:', err)
      setError('网络错误，加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  // ---- 展开/折叠 ----
  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    const allIds = new Set<string>()
    const collect = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.children.length > 0) {
          allIds.add(node.id)
          collect(node.children)
        }
      }
    }
    collect(tree)
    setExpandedIds(allIds)
  }, [tree])

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set())
  }, [])

  // ---- 弹窗操作 ----
  const openAddRoot = useCallback(() => {
    setEditingId(null)
    setFormData(defaultForm)
    setShowModal(true)
  }, [])

  const openAddChild = useCallback((parentId: string) => {
    setEditingId(null)
    setFormData({ ...defaultForm, parentId })
    setShowModal(true)
  }, [])

  const openEdit = useCallback((item: CategoryItem) => {
    setEditingId(item.id)
    setFormData({
      name: item.name,
      parentId: item.parentId,
      sortOrder: String(item.sortOrder),
    })
    setShowModal(true)
  }, [])

  const closeModal = useCallback(() => {
    setShowModal(false)
    setEditingId(null)
    setFormData(defaultForm)
    setMessage(null)
  }, [])

  // ---- 保存（创建或更新） ----
  const handleSave = useCallback(async () => {
    if (!formData.name.trim()) {
      setMessage({ type: 'error', text: '分类名称必填' })
      return
    }

    setSaving(true)
    setMessage(null)

    try {
      const token = getAuthToken()
      const payload = {
        name: formData.name.trim(),
        parentId: formData.parentId || null,
        sortOrder: parseInt(formData.sortOrder) || 0,
      }

      let res: Response
      if (editingId) {
        // 更新
        res = await fetch(`/api/admin/categories/${editingId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        })
      } else {
        // 创建
        res = await fetch('/api/admin/categories', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        })
      }

      const data = await res.json()
      if (data.success) {
        setShowModal(false)
        setMessage({ type: 'success', text: editingId ? '更新成功' : '创建成功' })
        fetchCategories()
      } else {
        setMessage({ type: 'error', text: data.error || '操作失败' })
      }
    } catch (err) {
      logger.error('保存分类失败:', err)
      setMessage({ type: 'error', text: '网络错误' })
    } finally {
      setSaving(false)
    }
  }, [editingId, formData, fetchCategories])

  // ---- 删除 ----
  const confirmDelete = useCallback((id: string) => {
    setDeleteId(id)
  }, [])

  const handleDelete = useCallback(async () => {
    if (!deleteId) return
    setDeleting(true)

    try {
      const token = getAuthToken()
      const res = await fetch(`/api/admin/categories/${deleteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })

      const data = await res.json()
      if (data.success) {
        setDeleteId(null)
        setMessage({ type: 'success', text: '删除成功' })
        fetchCategories()
      } else {
        setDeleteId(null)
        setMessage({ type: 'error', text: data.error || '删除失败' })
      }
    } catch (err) {
      logger.error('删除分类失败:', err)
      setDeleteId(null)
      setMessage({ type: 'error', text: '网络错误' })
    } finally {
      setDeleting(false)
    }
  }, [deleteId, fetchCategories])

  // ---- 获取分类的层级路径名 ----
  const getCategoryPath = useCallback((id: string): string => {
    const item = categories.find(c => c.id === id)
    if (!item) return ''
    const names: string[] = [item.name]
    let current = item
    while (current.parentId) {
      const parent = categories.find(c => c.id === current.parentId)
      if (!parent) break
      names.unshift(parent.name)
      current = parent
    }
    return names.join(' / ')
  }, [categories])

  // ---- 加载状态 ----
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-500">加载中...</span>
      </div>
    )
  }

  // ---- 错误状态 ----
  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <span className="ml-3 text-red-600">{error}</span>
      </div>
    )
  }

  return (
    <div>
      {/* 顶部 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">分类管理</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            全部展开
          </button>
          <button
            onClick={collapseAll}
            className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            全部折叠
          </button>
          <button
            onClick={openAddRoot}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg
              hover:bg-blue-700 transition-colors font-medium"
          >
            <Plus className="w-4 h-4" />
            添加根分类
          </button>
        </div>
      </div>

      {/* 消息提示 */}
      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          message.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {/* 树形列表 */}
      {tree.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
          <FolderTree className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">暂无分类</p>
          <button
            onClick={openAddRoot}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            添加根分类
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* 表头 */}
          <div className="grid grid-cols-[1fr_80px_160px] gap-4 px-6 py-3 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-500">
            <span>分类名称</span>
            <span>排序</span>
            <span>操作</span>
          </div>

          {/* 树形内容 */}
          <CategoryTreeList
            nodes={tree}
            expandedIds={expandedIds}
            toggleExpand={toggleExpand}
            onEdit={openEdit}
            onAddChild={openAddChild}
            onDelete={confirmDelete}
            depth={0}
          />
        </div>
      )}

      <p className="mt-4 text-sm text-gray-400">共 {categories.length} 个分类</p>

      {/* 编辑/创建弹窗 */}
      {showModal && (
        <CategoryFormModal
          editingId={editingId}
          formData={formData}
          saving={saving}
          categories={categories}
          getCategoryPath={getCategoryPath}
          onClose={closeModal}
          onSave={handleSave}
          onFormDataChange={setFormData}
        />
      )}

      {/* 删除确认弹窗 */}
      {deleteId && (
        <CategoryDeleteModal
          categoryName={categories.find(c => c.id === deleteId)?.name || ''}
          deleting={deleting}
          onCancel={() => setDeleteId(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}

