'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, AlertCircle, Plus, Edit2, Trash2, FolderTree,
  ChevronRight, ChevronDown, Folder, FolderOpen, Save
} from 'lucide-react'

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
      const token = localStorage.getItem('token')
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
      console.error('获取分类失败:', err)
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
      const token = localStorage.getItem('token')
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
      console.error('保存分类失败:', err)
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
      const token = localStorage.getItem('token')
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
      console.error('删除分类失败:', err)
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
          <TreeList
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
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
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
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
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
                  onChange={e => setFormData(prev => ({ ...prev, sortOrder: e.target.value }))}
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
                      setFormData(prev => ({
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
                onClick={closeModal}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm"
              >
                取消
              </button>
              <button
                onClick={handleSave}
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
      )}

      {/* 删除确认弹窗 */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteId(null)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">确认删除</h2>
            <p className="text-sm text-gray-600 mb-4">
              确定要删除分类「{categories.find(c => c.id === deleteId)?.name}」吗？
              如果该分类下有子分类或商品，将无法删除。
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
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
      )}
    </div>
  )
}

// ---- 递归树形列表组件 ----

interface TreeListProps {
  nodes: TreeNode[]
  expandedIds: Set<string>
  toggleExpand: (id: string) => void
  onEdit: (item: CategoryItem) => void
  onAddChild: (parentId: string) => void
  onDelete: (id: string) => void
  depth: number
}

function TreeList({ nodes, expandedIds, toggleExpand, onEdit, onAddChild, onDelete, depth }: TreeListProps) {
  if (nodes.length === 0) return null

  return (
    <div>
      {nodes.map(node => {
        const hasChildren = node.children.length > 0
        const isExpanded = expandedIds.has(node.id)

        return (
          <div key={node.id}>
            <div
              className="grid grid-cols-[1fr_80px_160px] gap-4 px-6 py-3 border-b border-gray-100
                hover:bg-gray-50 transition-colors items-center"
              style={{ paddingLeft: `${24 + depth * 24}px` }}
            >
              {/* 名称 */}
              <div className="flex items-center gap-2 min-w-0">
                {hasChildren ? (
                  <button
                    onClick={() => toggleExpand(node.id)}
                    className="p-0.5 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                ) : (
                  <span className="w-5" />
                )}
                {hasChildren ? (
                  isExpanded ? <FolderOpen className="w-4 h-4 text-blue-500" /> : <Folder className="w-4 h-4 text-gray-400" />
                ) : (
                  <Folder className="w-4 h-4 text-gray-300" />
                )}
                <span className="text-sm font-medium text-gray-900 truncate">{node.name}</span>
                {hasChildren && (
                  <span className="text-xs text-gray-400">({node.children.length})</span>
                )}
              </div>

              {/* 排序 */}
              <span className="text-sm text-gray-500 text-center">{node.sortOrder}</span>

              {/* 操作 */}
              <div className="flex items-center gap-1 justify-end">
                <button
                  onClick={() => onAddChild(node.id)}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title="添加子分类"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onEdit(node)}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title="编辑"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDelete(node.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="删除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 子节点 */}
            {hasChildren && isExpanded && (
              <TreeList
                nodes={node.children}
                expandedIds={expandedIds}
                toggleExpand={toggleExpand}
                onEdit={onEdit}
                onAddChild={onAddChild}
                onDelete={onDelete}
                depth={depth + 1}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}