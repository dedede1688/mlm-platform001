'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import {
  Package, Plus, Search, Edit2, Trash2, Loader2,
  ChevronLeft, ChevronRight, X, Image as ImageIcon, ToggleLeft, ToggleRight,
  PlusCircle, MinusCircle
} from 'lucide-react'
import ImageUpload from '@/components/ImageUpload'
import RichTextEditor from '@/components/RichTextEditor'
import VideoUpload from '@/components/VideoUpload'

interface Product {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  retailPrice: number
  memberPrice: number
  stock: number
  isUpgradeProduct: boolean
  maxPointsRatio: number
  benefits: string[] | null
  status: string
  sortOrder: number
  categoryId: string | null
  specs: SpecGroup[] | null
  images: string[] | null
  videoUrl: string | null
  category: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
}

interface SpecGroup {
  name: string
  values: string[]
}

interface CategoryItem {
  id: string
  name: string
  parentId: string | null
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

interface FormData {
  name: string
  description: string
  imageUrl: string
  retailPrice: string
  memberPrice: string
  stock: string
  isUpgradeProduct: boolean
  maxPointsRatio: string
  benefits: string[]
  status: string
  sortOrder: string
  categoryId: string
  specs: SpecGroup[]
  images: string[]
  videoUrl: string
}

const defaultForm: FormData = {
  name: '',
  description: '',
  imageUrl: '',
  retailPrice: '',
  memberPrice: '',
  stock: '0',
  isUpgradeProduct: false,
  maxPointsRatio: '50',
  benefits: [],
  status: 'active',
  sortOrder: '0',
  categoryId: '',
  specs: [],
  images: [],
  videoUrl: '',
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 10, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState<string | null>(null)

  // 搜索与筛选
  const [search, setSearch] = useState('')
  const [filterUpgrade, setFilterUpgrade] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // 弹窗
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(defaultForm)
  const [saving, setSaving] = useState(false)
  const [newBenefit, setNewBenefit] = useState('')

  // 删除确认
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // 分类数据
  const [categories, setCategories] = useState<CategoryItem[]>([])

  // 消息提示
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 获取 token
  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (storedToken) {
      setToken(storedToken)
      fetchProducts(storedToken, 1)
      fetchCategories(storedToken)
    }
  }, [])

  const fetchCategories = useCallback(async (authToken: string) => {
    try {
      const res = await fetch('/api/admin/categories', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      const data = await res.json()
      if (data.success) {
        setCategories(data.data || [])
      }
    } catch (error) {
      console.error('获取分类列表失败:', error)
    }
  }, [])

  // 将分类列表构建为树形选项（带层级缩进）
  const buildCategoryOptions = useCallback((): { id: string; name: string; depth: number }[] => {
    const map = new Map<string, CategoryItem>()
    categories.forEach(c => map.set(c.id, c))
    const result: { id: string; name: string; depth: number }[] = []
    const visited = new Set<string>()

    const traverse = (parentId: string | null, depth: number) => {
      categories
        .filter(c => c.parentId === parentId)
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(c => {
          if (visited.has(c.id)) return
          visited.add(c.id)
          result.push({ id: c.id, name: c.name, depth })
          traverse(c.id, depth + 1)
        })
    }
    traverse(null, 0)
    return result
  }, [categories])

  const fetchProducts = useCallback(async (authToken: string, page: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', '10')
      if (search) params.set('search', search)
      if (filterUpgrade) params.set('isUpgrade', filterUpgrade)
      if (filterStatus) params.set('status', filterStatus)

      const res = await fetch(`/api/admin/products?${params}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.status === 403 || res.status === 401) {
        window.location.href = '/login'
        return
      }
      const data = await res.json()
      if (data.success) {
        setProducts(data.data || [])
        setPagination(data.pagination || { page: 1, pageSize: 10, total: 0, totalPages: 0 })
      }
    } catch (error) {
      console.error('获取商品列表失败:', error)
      showMessage('error', '获取商品列表失败')
    } finally {
      setLoading(false)
    }
  }, [search, filterUpgrade, filterStatus])

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  // 搜索/筛选触发
  const handleSearch = () => {
    if (token) fetchProducts(token, 1)
  }

  const handlePageChange = (newPage: number) => {
    if (token && newPage >= 1 && newPage <= pagination.totalPages) {
      fetchProducts(token, newPage)
    }
  }

  // 打开新增弹窗
  const handleAdd = () => {
    setEditingId(null)
    setFormData(defaultForm)
    setNewBenefit('')
    setShowModal(true)
  }

  // 打开编辑弹窗
  const handleEdit = (product: Product) => {
    setEditingId(product.id)
    setFormData({
      name: product.name,
      description: product.description || '',
      imageUrl: product.imageUrl || '',
      retailPrice: String(product.retailPrice),
      memberPrice: String(product.memberPrice),
      stock: String(product.stock),
      isUpgradeProduct: product.isUpgradeProduct,
      maxPointsRatio: String(product.maxPointsRatio),
      benefits: Array.isArray(product.benefits) ? product.benefits : [],
      status: product.status,
      sortOrder: String(product.sortOrder),
      categoryId: product.categoryId || '',
      specs: Array.isArray(product.specs) ? product.specs : [],
      images: Array.isArray(product.images) ? product.images : [],
      videoUrl: product.videoUrl || '',
    })
    setNewBenefit('')
    setShowModal(true)
  }

  // 保存商品
  const handleSave = async () => {
    if (!token) return

    // 验证
    if (!formData.name.trim()) {
      showMessage('error', '商品名称不能为空')
      return
    }
    const rp = parseFloat(formData.retailPrice)
    const mp = parseFloat(formData.memberPrice)
    if (isNaN(rp) || rp <= 0) {
      showMessage('error', '零售价必须大于0')
      return
    }
    if (isNaN(mp) || mp <= 0) {
      showMessage('error', '会员价必须大于0')
      return
    }
    if (mp > rp) {
      showMessage('error', '会员价不能大于零售价')
      return
    }

    setSaving(true)
    try {
      const url = editingId
        ? `/api/admin/products/${editingId}`
        : '/api/admin/products'
      const method = editingId ? 'PUT' : 'POST'

      const body: Record<string, unknown> = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        imageUrl: formData.imageUrl.trim() || null,
        retailPrice: rp,
        memberPrice: mp,
        stock: parseInt(formData.stock) || 0,
        isUpgradeProduct: formData.isUpgradeProduct,
        maxPointsRatio: parseInt(formData.maxPointsRatio) || 50,
        benefits: formData.benefits.length > 0 ? formData.benefits : null,
        status: formData.status,
        sortOrder: parseInt(formData.sortOrder) || 0,
        categoryId: formData.categoryId || null,
        specs: formData.specs.filter(s => s.name.trim()).length > 0
          ? formData.specs.filter(s => s.name.trim()).map(s => ({
              name: s.name.trim(),
              values: s.values.filter(v => v.trim()).map(v => v.trim()),
            }))
          : null,
        images: formData.images.length > 0 ? formData.images : null,
        videoUrl: formData.videoUrl.trim() || null,
      }

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (data.success) {
        showMessage('success', editingId ? '商品更新成功' : '商品创建成功')
        setShowModal(false)
        fetchProducts(token, editingId ? pagination.page : 1)
      } else {
        showMessage('error', data.message || '操作失败')
      }
    } catch {
      showMessage('error', '网络错误，请重试')
    } finally {
      setSaving(false)
    }
  }

  // 删除商品
  const handleDelete = async () => {
    if (!token || !deleteId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/products/${deleteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        showMessage('success', '商品已删除')
        setDeleteId(null)
        fetchProducts(token, pagination.page)
      } else {
        showMessage('error', data.message || '删除失败')
      }
    } catch {
      showMessage('error', '网络错误，请重试')
    } finally {
      setDeleting(false)
    }
  }

  // 切换商品状态（上架/下架）
  const toggleStatus = async (product: Product) => {
    if (!token) return
    const newStatus = product.status === 'active' ? 'inactive' : 'active'
    const actionText = newStatus === 'active' ? '上架' : '下架'
    try {
      const res = await fetch(`/api/admin/products/${product.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json()
      if (data.success) {
        showMessage('success', `商品已${actionText}`)
        fetchProducts(token, pagination.page)
      } else {
        showMessage('error', data.message || `${actionText}失败`)
      }
    } catch {
      showMessage('error', '网络错误，请重试')
    }
  }

  // benefits 操作
  // ---- 规格操作 ----
  const addSpecGroup = () => {
    setFormData(prev => ({
      ...prev,
      specs: [...prev.specs, { name: '', values: [] }],
    }))
  }

  const removeSpecGroup = (idx: number) => {
    setFormData(prev => ({
      ...prev,
      specs: prev.specs.filter((_, i) => i !== idx),
    }))
  }

  const updateSpecGroupName = (idx: number, name: string) => {
    setFormData(prev => ({
      ...prev,
      specs: prev.specs.map((s, i) => i === idx ? { ...s, name } : s),
    }))
  }

  const addSpecValue = (groupIdx: number) => {
    setFormData(prev => ({
      ...prev,
      specs: prev.specs.map((s, i) =>
        i === groupIdx ? { ...s, values: [...s.values, ''] } : s
      ),
    }))
  }

  const removeSpecValue = (groupIdx: number, valueIdx: number) => {
    setFormData(prev => ({
      ...prev,
      specs: prev.specs.map((s, i) =>
        i === groupIdx ? { ...s, values: s.values.filter((_, vi) => vi !== valueIdx) } : s
      ),
    }))
  }

  const updateSpecValue = (groupIdx: number, valueIdx: number, val: string) => {
    setFormData(prev => ({
      ...prev,
      specs: prev.specs.map((s, i) =>
        i === groupIdx ? { ...s, values: s.values.map((v, vi) => vi === valueIdx ? val : v) } : s
      ),
    }))
  }

  // ---- 多图操作 ----
  const addImage = (url: string) => {
    if (url.trim()) {
      setFormData(prev => ({
        ...prev,
        images: [...prev.images, url.trim()],
      }))
    }
  }

  const removeImage = (idx: number) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== idx),
    }))
  }

  const addBenefit = () => {
    const val = newBenefit.trim()
    if (val && !formData.benefits.includes(val)) {
      setFormData(prev => ({ ...prev, benefits: [...prev.benefits, val] }))
      setNewBenefit('')
    }
  }
  const removeBenefit = (idx: number) => {
    setFormData(prev => ({ ...prev, benefits: prev.benefits.filter((_, i) => i !== idx) }))
  }

  // 渲染
  return (
    <>
      {/* 页面标题 */}
      <div className="flex items-center gap-3 mb-6">
        <Package className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold text-gray-900">商品管理</h1>
      </div>

        {/* 消息提示 */}
        {message && (
          <div className={`mb-6 flex items-center gap-2 px-4 py-3 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.type === 'success' ? (
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            ) : (
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* 工具栏 */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full sm:w-auto">
              {/* 搜索框 */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="搜索商品名称/描述..."
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg
                    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    transition-colors text-gray-900 placeholder-gray-400
                    hover:border-gray-400"
                />
              </div>
              {/* 筛选：升级产品 */}
              <select
                value={filterUpgrade}
                onChange={e => setFilterUpgrade(e.target.value)}
                className="px-4 py-2.5 border border-gray-300 rounded-lg
                  focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                  transition-colors text-gray-900 hover:border-gray-400"
              >
                <option value="">全部类型</option>
                <option value="true">升级产品</option>
                <option value="false">普通产品</option>
              </select>
              {/* 筛选：状态 */}
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="px-4 py-2.5 border border-gray-300 rounded-lg
                  focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                  transition-colors text-gray-900 hover:border-gray-400"
              >
                <option value="">全部状态</option>
                <option value="active">上架</option>
                <option value="inactive">下架</option>
              </select>
              {/* 搜索按钮 */}
              <button
                onClick={handleSearch}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700
                  transition-colors font-medium whitespace-nowrap"
              >
                搜索
              </button>
            </div>
            {/* 新增按钮 */}
            <button
              onClick={handleAdd}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white
                rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              新增商品
            </button>
          </div>
        </div>

        {/* 商品列表 */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <span className="ml-2 text-gray-500">加载中...</span>
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Package className="w-12 h-12 mb-3" />
              <p>暂无商品数据</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">图片</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">名称</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">分类</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">零售价</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">会员价</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">库存</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">升级产品</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">状态</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {products.map(product => (
                    <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                      {/* 图片 */}
                      <td className="px-4 py-3">
                        {product.imageUrl ? (
                          <div className="relative w-12 h-12">
                            <Image
                              src={product.imageUrl}
                              alt={product.name}
                              fill
                              className="rounded-lg object-cover border border-gray-200"
                            />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                            <ImageIcon className="w-5 h-5 text-gray-300" />
                          </div>
                        )}
                      </td>
                      {/* 名称 */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{product.name}</div>
                        {product.description && (
                          <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">{product.description}</div>
                        )}
                      </td>
                      {/* 分类 */}
                      <td className="px-4 py-3">
                        {product.category ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700">
                            {product.category.name}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">未分类</span>
                        )}
                      </td>
                      {/* 零售价 */}
                      <td className="px-4 py-3 text-gray-700">¥{product.retailPrice.toFixed(2)}</td>
                      {/* 会员价 */}
                      <td className="px-4 py-3 text-blue-600 font-medium">¥{product.memberPrice.toFixed(2)}</td>
                      {/* 库存 */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          product.stock > 10
                            ? 'bg-green-50 text-green-700'
                            : product.stock > 0
                            ? 'bg-yellow-50 text-yellow-700'
                            : 'bg-red-50 text-red-700'
                        }`}>
                          {product.stock}
                        </span>
                      </td>
                      {/* 升级产品 */}
                      <td className="px-4 py-3">
                        {product.isUpgradeProduct ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700">
                            升级
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-500">
                            普通
                          </span>
                        )}
                      </td>
                      {/* 状态 */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          product.status === 'active'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {product.status === 'active' ? '上架' : '下架'}
                        </span>
                      </td>
                      {/* 操作 */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => toggleStatus(product)}
                            className={`inline-flex items-center gap-1 px-2 py-1.5 text-sm rounded-lg transition-colors font-medium ${
                              product.status === 'active'
                                ? 'text-gray-600 hover:bg-gray-50'
                                : 'text-green-600 hover:bg-green-50'
                            }`}
                            title={product.status === 'active' ? '点击下架' : '点击上架'}
                          >
                            {product.status === 'active' ? '下架' : '上架'}
                          </button>
                          <button
                            onClick={() => handleEdit(product)}
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-sm text-blue-600
                              hover:bg-blue-50 rounded-lg transition-colors font-medium"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            编辑
                          </button>
                          <button
                            onClick={() => setDeleteId(product.id)}
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-sm text-red-600
                              hover:bg-red-50 rounded-lg transition-colors font-medium"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 分页 */}
          {!loading && pagination.totalPages > 0 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
              <div className="text-sm text-gray-500">
                共 {pagination.total} 件商品，第 {pagination.page}/{pagination.totalPages} 页
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700
                    bg-white border border-gray-300 rounded-lg hover:bg-gray-50
                    disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  上一页
                </button>
                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                  .filter(p => {
                    // 显示当前页附近页码
                    if (pagination.totalPages <= 7) return true
                    return Math.abs(p - pagination.page) <= 2 || p === 1 || p === pagination.totalPages
                  })
                  .map((p, idx, arr) => {
                    // 省略号
                    const prev = arr[idx - 1]
                    const showEllipsis = prev && p - prev > 1
                    return (
                      <span key={p} className="flex items-center">
                        {showEllipsis && <span className="px-2 text-gray-400">...</span>}
                        <button
                          onClick={() => handlePageChange(p)}
                          className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                            p === pagination.page
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {p}
                        </button>
                      </span>
                    )
                  })}
                <button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700
                    bg-white border border-gray-300 rounded-lg hover:bg-gray-50
                    disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  下一页
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

      {/* 新增/编辑商品弹窗 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* 遮罩 */}
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          {/* 弹窗内容 */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* 弹窗标题 */}
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-200 flex items-center justify-between rounded-t-2xl z-10">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingId ? '编辑商品' : '新增商品'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 表单 */}
            <div className="px-6 py-5 space-y-5">
              {/* 名称 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  商品名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400"
                  placeholder="请输入商品名称"
                />
              </div>

              {/* 描述 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">商品描述</label>
                <RichTextEditor
                  content={formData.description}
                  onChange={html => setFormData(prev => ({ ...prev, description: html }))}
                  placeholder="请输入商品描述"
                />
              </div>

              {/* 分类选择 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">商品分类</label>
                <select
                  value={formData.categoryId}
                  onChange={e => setFormData(prev => ({ ...prev, categoryId: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    transition-colors text-gray-900 hover:border-gray-400 bg-white"
                >
                  <option value="">-- 未分类 --</option>
                  {buildCategoryOptions().map(opt => (
                    <option key={opt.id} value={opt.id}>
                      {'　'.repeat(opt.depth)}{opt.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 图片 */}
              <ImageUpload
                label="商品图片"
                value={formData.imageUrl}
                onChange={url => setFormData(prev => ({ ...prev, imageUrl: url }))}
                placeholder="https://example.com/image.jpg"
                bucket="products"
                folder="products"
                maxSizeMB={5}
              />

              {/* 价格行 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    零售价 <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">¥</span>
                    <input
                      type="number"
                      value={formData.retailPrice}
                      onChange={e => setFormData(prev => ({ ...prev, retailPrice: e.target.value }))}
                      min="0"
                      step="0.01"
                      className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg
                        focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                        transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    会员价 <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">¥</span>
                    <input
                      type="number"
                      value={formData.memberPrice}
                      onChange={e => setFormData(prev => ({ ...prev, memberPrice: e.target.value }))}
                      min="0"
                      step="0.01"
                      className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg
                        focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                        transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              {/* 库存 + 积分抵扣比例 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">库存</label>
                  <input
                    type="number"
                    value={formData.stock}
                    onChange={e => setFormData(prev => ({ ...prev, stock: e.target.value }))}
                    min="0"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                      focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                      transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    积分抵扣比例 <span className="text-xs text-gray-400">(0-100)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={formData.maxPointsRatio}
                      onChange={e => setFormData(prev => ({ ...prev, maxPointsRatio: e.target.value }))}
                      min="0"
                      max="100"
                      className="w-full pr-8 px-4 py-2.5 border border-gray-300 rounded-lg
                        focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                        transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400"
                      placeholder="50"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                  </div>
                </div>
              </div>

              {/* 是否升级产品 + 排序 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">是否升级产品</label>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, isUpgradeProduct: !prev.isUpgradeProduct }))}
                    className="flex items-center gap-2"
                  >
                    {formData.isUpgradeProduct ? (
                      <ToggleRight className="w-10 h-6 text-blue-600" />
                    ) : (
                      <ToggleLeft className="w-10 h-6 text-gray-300" />
                    )}
                    <span className={`text-sm font-medium ${formData.isUpgradeProduct ? 'text-blue-600' : 'text-gray-500'}`}>
                      {formData.isUpgradeProduct ? '是' : '否'}
                    </span>
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">排序</label>
                  <input
                    type="number"
                    value={formData.sortOrder}
                    onChange={e => setFormData(prev => ({ ...prev, sortOrder: e.target.value }))}
                    min="0"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                      focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                      transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* 状态 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">状态</label>
                <div className="flex items-center gap-4">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      value="active"
                      checked={formData.status === 'active'}
                      onChange={e => setFormData(prev => ({ ...prev, status: e.target.value }))}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">上架</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      value="inactive"
                      checked={formData.status === 'inactive'}
                      onChange={e => setFormData(prev => ({ ...prev, status: e.target.value }))}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">下架</span>
                  </label>
                </div>
              </div>

              {/* 功效标签 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">功效标签</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newBenefit}
                    onChange={e => setNewBenefit(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addBenefit())}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg
                      focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                      transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400 text-sm"
                    placeholder="输入标签后回车添加"
                  />
                  <button
                    type="button"
                    onClick={addBenefit}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200
                      transition-colors text-sm font-medium whitespace-nowrap"
                  >
                    添加
                  </button>
                </div>
                {formData.benefits.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formData.benefits.map((b, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700
                          rounded-full text-sm font-medium"
                      >
                        {b}
                        <button
                          type="button"
                          onClick={() => removeBenefit(idx)}
                          className="text-blue-400 hover:text-blue-600 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* 商品规格 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">商品规格</label>
                  <button
                    type="button"
                    onClick={addSpecGroup}
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700
                      font-medium transition-colors"
                  >
                    <PlusCircle className="w-4 h-4" />
                    添加规格组
                  </button>
                </div>
                {formData.specs.length === 0 && (
                  <p className="text-xs text-gray-400">暂无规格，点击「添加规格组」创建</p>
                )}
                <div className="space-y-3">
                  {formData.specs.map((spec, gi) => (
                    <div key={gi} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="text"
                          value={spec.name}
                          onChange={e => updateSpecGroupName(gi, e.target.value)}
                          className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm
                            focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                            text-gray-900 placeholder-gray-400 bg-white"
                          placeholder="规格名称（如：颜色、尺寸）"
                        />
                        <button
                          type="button"
                          onClick={() => removeSpecGroup(gi)}
                          className="text-red-400 hover:text-red-600 transition-colors"
                        >
                          <MinusCircle className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {spec.values.map((val, vi) => (
                          <span
                            key={vi}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-gray-200
                              rounded-md text-sm text-gray-700"
                          >
                            {val}
                            <button
                              type="button"
                              onClick={() => removeSpecValue(gi, vi)}
                              className="text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="输入规格值后回车"
                          className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm
                            focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                            text-gray-900 placeholder-gray-400 bg-white"
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              const target = e.target as HTMLInputElement
                              if (target.value.trim()) {
                                updateSpecValue(gi, spec.values.length, target.value.trim())
                                target.value = ''
                              }
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => addSpecValue(gi)}
                          className="px-3 py-1.5 text-xs bg-white border border-gray-300 text-gray-600
                            rounded-md hover:bg-gray-50 transition-colors font-medium"
                        >
                          添加值
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 多图上传 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">商品多图</label>
                {formData.images.length > 0 && (
                  <div className="grid grid-cols-4 gap-3 mb-3">
                    {formData.images.map((img, idx) => (
                      <div key={idx} className="relative group w-full aspect-square">
                        <Image
                          src={img}
                          alt={`商品图 ${idx + 1}`}
                          fill
                          className="rounded-lg object-cover border border-gray-200"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(idx)}
                          className="absolute top-1 right-1 p-0.5 bg-red-500 text-white rounded-full
                            opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <ImageUpload
                  label=""
                  value=""
                  onChange={url => addImage(url)}
                  bucket="products"
                  folder="products/gallery"
                  maxSizeMB={5}
                />
              </div>

              {/* 视频上传 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">商品视频</label>
                <VideoUpload
                  value={formData.videoUrl}
                  onChange={url => setFormData(prev => ({ ...prev, videoUrl: url }))}
                />
              </div>
            </div>

            {/* 弹窗底部按钮 */}
            <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-gray-200 flex justify-end gap-3 rounded-b-2xl">
              <button
                onClick={() => setShowModal(false)}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg
                  hover:bg-gray-50 transition-colors font-medium"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-lg
                  text-white font-medium transition-all ${
                    saving
                      ? 'bg-blue-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 shadow-sm'
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
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">确认删除</h3>
            <p className="text-gray-600 mb-6">确定要删除此商品吗？此操作不可撤销。</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg
                  hover:bg-gray-50 transition-colors font-medium"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg
                  text-white font-medium transition-all ${
                    deleting
                      ? 'bg-red-400 cursor-not-allowed'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
              >
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                {deleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}