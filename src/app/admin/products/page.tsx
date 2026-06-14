'use client'
// v7.0-fix: 修复构建错误 - 调试日志语法优化

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import {
  Package, Plus, Search, Edit2, Trash2, Loader2,
  ChevronLeft, ChevronRight, X, Image as ImageIcon, ToggleLeft, ToggleRight,
  PlusCircle, MinusCircle, ClipboardCopy
} from 'lucide-react'
import { supabaseBrowserClient, isSupabaseAvailable } from '@/lib/supabase/client'
import ImageUpload from '@/components/ImageUpload'
import RichTextEditor from '@/components/RichTextEditor'
import VideoUpload from '@/components/VideoUpload'

interface Product {
  id: string
  name: string
  description: string | null
  images: string[] | null
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
  research: string | null
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
  images: string[]
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
  research: string
  videoUrl: string
}

const defaultForm: FormData = {
  name: '',
  description: '',
  images: [],
  retailPrice: '',
  memberPrice: '',
  stock: '0',
  isUpgradeProduct: false,
  maxPointsRatio: '0',
  benefits: [],
  status: 'active',
  sortOrder: '0',
  categoryId: '',
  specs: [],
  research: '',
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

// 复制商品
const [duplicatingId, setDuplicatingId] = useState<string | null>(null)

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
      images: Array.isArray(product.images) ? product.images : [],
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
      research: product.research || '',
      videoUrl: product.videoUrl || '',
    })
    // 🔍 调试：打印加载的规格数据
    console.log('[AdminProducts] 编辑模式 - 加载的原始specs数据:', JSON.stringify(product.specs, null, 2))
    console.log('[AdminProducts] 编辑模式 - 赋值后的formData.specs:', JSON.stringify(Array.isArray(product.specs) ? product.specs : [], null, 2))
    setNewBenefit('')
    setShowModal(true)
  }

  // 将 Base64 图片数据上传到 Supabase Storage 并返回 URL
  const uploadBase64ToSupabase = useCallback(async (base64Data: string, index: number): Promise<string> => {
    if (!base64Data.startsWith('data:image')) {
      // 已经是 URL，直接返回
      return base64Data
    }

    if (!isSupabaseAvailable() || !supabaseBrowserClient) {
      throw new Error(`图片 ${index + 1} 是 Base64 格式但 Supabase 不可用，无法保存`)
    }

    // 从 Base64 数据中提取文件信息
    const [header, data] = base64Data.split(',')
    if (!data) {
      throw new Error(`图片 ${index + 1} 的 Base64 数据格式无效`)
    }

        const mimeMatch = header.match(/data:image\/([^;]+)/)
        const ext = mimeMatch ? mimeMatch[1] : 'jpg'
        const random = Math.random().toString(36).substring(2, 8)
    const fileName = `${Date.now()}-${random}.${ext}`
    const filePath = `products/gallery/${fileName}`

    // 将 Base64 转为 Blob 再上传
    const byteChars = atob(data)
    const byteArray = new Uint8Array(byteChars.length)
    for (let i = 0; i < byteChars.length; i++) {
      byteArray[i] = byteChars.charCodeAt(i)
    }
    const blob = new Blob([byteArray], { type: `image/${ext}` })
    const file = new File([blob], fileName, { type: `image/${ext}` })

    const { error: uploadError } = await supabaseBrowserClient.storage
      .from('products')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      throw new Error(`图片 ${index + 1} 上传失败: ${uploadError.message}`)
    }

    const { data: urlData } = supabaseBrowserClient.storage.from('products').getPublicUrl(filePath)
    return urlData.publicUrl
  }, [])

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
      // 先处理图片：将 Base64 转换为 URL（避免 payload 过大）
      let processedImages: string[] = []
      if (formData.images.length > 0) {
        processedImages = await Promise.all(
          formData.images.map((img, idx) => uploadBase64ToSupabase(img, idx))
        )
      }

      // 检查描述中是否包含 Base64 图片（Tiptap 编辑器可能嵌入 base64 或 URL）
      const desc = formData.description.trim()
      let processedDesc = desc
      if (desc.includes('data:image')) {
        // 提取描述中的所有 base64 图片并替换
        // 兼容 src="data:..." 和 src=data:... 两种格式（TipTap 可能生成不带引号的属性）
        const base64Regex = /src=["']?(data:image[^"'\s>]+)["']?/g
        let match
        let replaceCount = 0
        while ((match = base64Regex.exec(desc)) !== null) {
          const base64Src = match[1]
          try {
            const url = await uploadBase64ToSupabase(base64Src, replaceCount)
            processedDesc = processedDesc.replace(base64Src, url)
            replaceCount++
          } catch (err) {
            console.error('描述中图片转换失败:', err)
            // 转换失败时移除该 base64 图片，避免存入巨大字符串
            processedDesc = processedDesc.replace(base64Src, '')
          }
        }
      }

      const url = editingId
        ? `/api/admin/products/${editingId}`
        : '/api/admin/products'
      const method = editingId ? 'PUT' : 'POST'

      const body: Record<string, unknown> = {
        name: formData.name.trim(),
        description: processedDesc || null,
        // images 第一张作为主图/封面
        imageUrl: processedImages.length > 0 ? processedImages[0] : null,
        retailPrice: rp,
        memberPrice: mp,
        stock: parseInt(formData.stock) || 0,
        isUpgradeProduct: formData.isUpgradeProduct,
        // 升级产品强制积分抵扣为0；普通产品默认0，最高不超过50
        maxPointsRatio: formData.isUpgradeProduct ? 0 : Math.min(50, parseInt(formData.maxPointsRatio) || 0),
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
        research: formData.research.trim() || null,
        images: processedImages.length > 0 ? processedImages : null,
        videoUrl: formData.videoUrl.trim() || null,
      }

      // 🔍 调试：打印提交的完整数据
      console.log('[AdminProducts] 提交前的specs数据:', JSON.stringify(body.specs, null, 2))

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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '未知错误'
      // 给出更具体的错误提示
      if (message.includes('body') || message.includes('payload') || message.includes('413') || message.includes('size') || message.includes('large')) {
        showMessage('error', '图片数据过大，请减少上传的图片数量或压缩图片后重试')
      } else if (message.includes('fetch') || message.includes('network') || message.includes('Failed')) {
        showMessage('error', '网络连接失败，请检查网络后重试')
      } else if (message.includes('Supabase') || message.includes('上传') || message.includes('Base64')) {
        showMessage('error', message)
      } else {
        showMessage('error', `保存失败：${message}`)
      }
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

// 复制商品
const handleDuplicate = async (product: Product) => {
  if (!token) return
  setDuplicatingId(product.id)
  try {
    const res = await fetch(`/api/admin/products/${product.id}/duplicate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (data.success && data.data?.id) {
      showMessage('success', `商品已复制：${data.data.name}`)
      // 直接在当前页面打开新副本的编辑弹窗（而非跳转到不存在的 /edit 路由）
      const newId = data.data.id
      setEditingId(newId)
      setFormData({
        name: data.data.name,
        description: product.description || '',
        images: Array.isArray(product.images) ? product.images : [],
        retailPrice: String(product.retailPrice),
        memberPrice: String(product.memberPrice),
        stock: '0', // 副本库存归零
        isUpgradeProduct: product.isUpgradeProduct,
        maxPointsRatio: String(product.maxPointsRatio),
        benefits: Array.isArray(product.benefits) ? product.benefits : [],
        status: 'inactive', // 副本默认下架
        sortOrder: String(product.sortOrder + 1),
        categoryId: product.categoryId || '',
        specs: Array.isArray(product.specs) ? product.specs : [],
        research: product.research || '',
        videoUrl: product.videoUrl || '',
      })
      setNewBenefit('')
      setShowModal(true)
      // 刷新列表以显示新副本
      fetchProducts(token, pagination.page)
    } else {
      showMessage('error', data.message || data.error || '复制失败')
    }
  } catch {
    showMessage('error', '网络错误，请重试')
  } finally {
    setDuplicatingId(null)
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

  // ---- 多图操作（最多3张）----
  const addImage = (url: string) => {
    if (url.trim() && formData.images.length < 3) {
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
              <table className="w-full table-auto" style={{ tableLayout: 'fixed', minWidth: '1200px' }}>
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[80px]">图片</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-[200px]">名称</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[100px]">分类</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[90px]">零售价</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[90px]">会员价</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[70px]">库存</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[85px]">升级产品</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[70px]">状态</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-[180px]">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {products.map(product => (
                    <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                      {/* 图片 */}
                      <td className="px-4 py-3">
                        {product.images && product.images.length > 0 ? (
                          <div className="relative w-12 h-12">
                            <Image
                              src={product.images[0]}
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
                            onClick={() => handleDuplicate(product)}
                            disabled={duplicatingId === product.id}
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-sm text-gray-600
                              hover:bg-gray-100 rounded-lg transition-colors font-medium
                              disabled:opacity-50 disabled:cursor-not-allowed"
                            title="复制商品"
                          >
                            <ClipboardCopy className={`w-3.5 h-3.5 ${duplicatingId === product.id ? 'animate-spin' : ''}`} />
                            {duplicatingId === product.id ? '复制中...' : '复制'}
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

              {/* 产品主图（最多3张，第一张作为封面） */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  产品主图 <span className="text-xs text-gray-400 font-normal">（最多3张，第一张为封面）</span>
                </label>
                {formData.images.length > 0 && (
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    {formData.images.map((img, idx) => (
                      <div key={idx} className="relative group w-full aspect-square">
                        <div className={`absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                          idx === 0
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-400/80 text-white'
                        }`}>
                          {idx === 0 ? '封面' : `${idx + 1}`}
                        </div>
                        <Image
                          src={img}
                          alt={`产品图 ${idx + 1}`}
                          fill
                          className="rounded-lg object-cover border border-gray-200"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(idx)}
                          className="absolute top-1 right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {formData.images.length < 3 && (
                  <ImageUpload
                    label=""
                    value=""
                    onChange={url => addImage(url)}
                    bucket="products"
                    folder="products/gallery"
                    maxSizeMB={5}
                  />
                )}
                {formData.images.length >= 3 && (
                  <p className="text-xs text-gray-400 mt-1">已达到最大数量限制（3张）</p>
                )}
              </div>

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
                    积分抵扣比例 {formData.isUpgradeProduct ? (
                      <span className="text-xs text-red-400 font-normal">(升级产品不可用)</span>
                    ) : (
                      <span className="text-xs text-gray-400">(0-50, 默认0)</span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={formData.isUpgradeProduct ? '0' : formData.maxPointsRatio}
                      onChange={e => setFormData(prev => ({ ...prev, maxPointsRatio: e.target.value }))}
                      min="0"
                      max="50"
                      disabled={formData.isUpgradeProduct}
                      className={`w-full pr-8 px-4 py-2.5 border border-gray-300 rounded-lg
                        focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                        transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400
                        ${formData.isUpgradeProduct ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''}`}
                        placeholder="0"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                  </div>
                  {formData.isUpgradeProduct && (
                    <p className="mt-1 text-[11px] text-red-400">升级产品不支持积分抵扣</p>
                  )}
                  {!formData.isUpgradeProduct && (
                    <p className="mt-1 text-[11px] text-gray-400">留空或填0表示不支持积分抵扣，最高50%</p>
                  )}
                </div>
              </div>

              {/* 是否升级产品 + 排序 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">是否升级产品</label>
                  <button
                    type="button"
                    onClick={() => {
                      const newValue = !formData.isUpgradeProduct
                      setFormData(prev => ({
                        ...prev,
                        isUpgradeProduct: newValue,
                        // 切换为升级产品时，自动将积分抵扣清零
                        maxPointsRatio: newValue ? '0' : prev.maxPointsRatio,
                      }))
                    }}
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
                          data-spec-group={gi}
                          placeholder="输入规格值后按回车添加"
                          className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm
                            focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                            text-gray-900 placeholder-gray-400 bg-white"
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              const target = e.target as HTMLInputElement
                              const val = target.value.trim()
                              if (val) {
                                // 🔧 修复：直接添加值到数组
                                setFormData(prev => ({
                                  ...prev,
                                  specs: prev.specs.map((s, i) =>
                                    i === gi ? { ...s, values: [...s.values, val] } : s
                                  )
                                }))
                                target.value = ''
                              }
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            // 获取对应的input值并添加
                            const inputEl = document.querySelector(`[data-spec-group="${gi}"]`) as HTMLInputElement
                            if (inputEl && inputEl.value.trim()) {
                              const val = inputEl.value.trim()
                              setFormData(prev => ({
                                ...prev,
                                specs: prev.specs.map((s, i) =>
                                  i === gi ? { ...s, values: [...s.values, val] } : s
                                )
                              }))
                              inputEl.value = ''
                            }
                          }}
                          className="px-3 py-1.5 text-xs bg-white border border-gray-300 text-gray-600
                            rounded-md hover:bg-gray-50 transition-colors font-medium"
                        >
                          添加值
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">💡 提示：输入规格值后按回车键或点击"添加值"按钮</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 科研背书 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">科研背书</label>
                <RichTextEditor
                  content={formData.research}
                  onChange={html => setFormData(prev => ({ ...prev, research: html }))}
                  placeholder="请输入科研背书内容（如科研背景、核心成果、临床试验等）"
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