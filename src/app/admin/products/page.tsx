'use client'
import { logger } from '@/lib/logger'
// v7.0-fix: 修复构建错误 - 调试日志语法优化

import { useState, useEffect, useCallback, useMemo } from 'react'
// Supabase client is lazy-loaded in uploadBase64ToSupabase to reduce initial bundle
let _supabaseClient: any = null
let _supabaseChecked = false
const getSupabaseClient = async () => {
  if (!_supabaseChecked) {
    try {
      const mod = await import('@/lib/supabase/client')
      if (mod.isSupabaseAvailable()) {
        _supabaseClient = mod.supabaseBrowserClient
      }
    } catch {}
    _supabaseChecked = true
  }
  return _supabaseClient
}
import { hasPermission } from '@/lib/admin-permissions'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { getAuthToken } from '@/lib/utils/auth-token'
import dynamic from 'next/dynamic'
import type { ProductFormData } from './_components/ProductForm'
import ProductTable, { type Product, type Pagination } from './_components/ProductTable'

const ProductForm = dynamic(() => import('./_components/ProductForm'), {
  ssr: false,
  loading: () => <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"><div className="bg-white rounded-xl p-8 animate-pulse">???...</div></div>,
})

export type { Product, Pagination } from './_components/ProductTable'

interface CategoryItem {
  id: string
  name: string
  parentId: string | null
}

const defaultForm: ProductFormData = {
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

  // v53.2: 多选 + 仅看低库存筛选
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)

  // 弹窗
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<ProductFormData>(defaultForm)
  const [saving, setSaving] = useState(false)

  // 删除确认
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)

  // 复制商品
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)

  // v68.7: 操作权限
  const [userRole, setUserRole] = useState<string>('')
  const [permsLoaded, setPermsLoaded] = useState(false)
  const canCreate = useMemo(() => hasPermission(userRole, 'create'), [userRole, permsLoaded])
  const canUpdate = useMemo(() => hasPermission(userRole, 'update'), [userRole, permsLoaded])
  const canDelete = useMemo(() => hasPermission(userRole, 'delete'), [userRole, permsLoaded])

  // 分类数据
  const [categories, setCategories] = useState<CategoryItem[]>([])

  // 消息提示
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const stripHtmlTags = (html: string): string => {
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
  }

  // 获取 token
  useEffect(() => {
    const storedToken = getAuthToken()
    if (storedToken) {
      setToken(storedToken)
      fetchProducts(storedToken, 1)
      fetchCategories(storedToken)
    }
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}')
      setUserRole(u.role || '')
    } catch { /* ignore */ }
    if (storedToken) {
      fetch('/api/admin/role-permissions', {
        headers: { Authorization: `Bearer ${storedToken}` },
      })
        .then(r => r.json())
        .then(data => {
          if (data?.success && data?.data?.config) {
            ;(window as { __ROLE_PERMISSIONS__?: Record<string, string[]> }).__ROLE_PERMISSIONS__ = data.data.config
            setPermsLoaded(true)
          }
        })
        .catch(() => { /* ignore */ })
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
      logger.error('获取分类列表失败:', error)
    }
  }, [])

  const buildCategoryOptions = useCallback((): { id: string; name: string; depth: number }[] => {
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
      logger.error('获取商品列表失败:', error)
      showMessage('error', '获取商品列表失败')
    } finally {
      setLoading(false)
    }
  }, [search, filterUpgrade, filterStatus])

  // v53.2: 分页/筛选变化时清空选择
  useEffect(() => {
    setSelectedIds(new Set())
  }, [pagination.page, filterStatus, filterUpgrade, search])

  // 当前页所有商品 ID
  const currentPageIds = useMemo(() => products.map(p => p.id), [products])

  const isAllCurrentPageSelected = useMemo(
    () => currentPageIds.length > 0 && currentPageIds.every(id => selectedIds.has(id)),
    [currentPageIds, selectedIds]
  )

  const lowStockCount = useMemo(
    () => products.filter(p => p.stock <= 10).length,
    [products]
  )

  // ---- Handlers ----

  const handleSearch = () => {
    if (token) fetchProducts(token, 1)
  }

  const handlePageChange = (newPage: number) => {
    if (token && newPage >= 1 && newPage <= pagination.totalPages) {
      fetchProducts(token, newPage)
    }
  }

  const handleAdd = () => {
    setEditingId(null)
    setFormData(defaultForm)
    setShowModal(true)
  }

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
    setShowModal(true)
  }

  const handleDuplicate = async (product: Product) => {
    if (!token) return
    setDuplicatingId(product.id)
    try {
      const res = await fetch(`/api/admin/products/${product.id}/duplicate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        showMessage('success', '商品复制成功')
        fetchProducts(token, pagination.page)
      } else {
        showMessage('error', data.message || '复制失败')
      }
    } catch {
      showMessage('error', '网络错误，请重试')
    } finally {
      setDuplicatingId(null)
    }
  }

  const uploadBase64ToSupabase = useCallback(async (base64Data: string, index: number): Promise<string> => {
    if (!base64Data.startsWith('data:image')) {
      return base64Data
    }

    const client = await getSupabaseClient()
    if (!client) {
      throw new Error(`图片 ${index + 1} 是 Base64 格式但 Supabase 不可用，无法保存`)
    }

    const [header, data] = base64Data.split(',')
    if (!data) {
      throw new Error(`图片 ${index + 1} 的 Base64 数据格式无效`)
    }

    const mimeMatch = header.match(/data:image\/([^;]+)/)
    const ext = mimeMatch ? mimeMatch[1] : 'jpg'
    const random = Math.random().toString(36).substring(2, 8)
    const fileName = `${Date.now()}-${random}.${ext}`
    const filePath = `products/gallery/${fileName}`

    const byteChars = atob(data)
    const byteArray = new Uint8Array(byteChars.length)
    for (let i = 0; i < byteChars.length; i++) {
      byteArray[i] = byteChars.charCodeAt(i)
    }
    const blob = new Blob([byteArray], { type: `image/${ext}` })
    const file = new File([blob], fileName, { type: `image/${ext}` })

    const { error: uploadError } = await client.storage
      .from('products')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      throw new Error(`图片 ${index + 1} 上传失败: ${uploadError.message}`)
    }

    const { data: urlData } = client.storage.from('products').getPublicUrl(filePath)
    return urlData.publicUrl
  }, [])

  const handleSave = async () => {
    if (!token) return

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
      let processedImages: string[] = []
      if (formData.images.length > 0) {
        processedImages = await Promise.all(
          formData.images.map((img, idx) => uploadBase64ToSupabase(img, idx))
        )
      }

      const desc = formData.description.trim()
      let processedDesc = desc
      if (desc.includes('data:image')) {
        const base64Regex = /src=["']?(data:image[^"'\s>]+)["']?/g
        let match
        while ((match = base64Regex.exec(desc)) !== null) {
          const base64Src = match[1]
          try {
            const url = await uploadBase64ToSupabase(base64Src, processedImages.length)
            processedDesc = processedDesc.replace(base64Src, url)
          } catch {
            // 替换失败则保留原样
          }
        }
      }

      let processedResearch = formData.research.trim()
      if (processedResearch.includes('data:image')) {
        const base64Regex = /src=["']?(data:image[^"'\s>]+)["']?/g
        let match
        while ((match = base64Regex.exec(processedResearch)) !== null) {
          const base64Src = match[1]
          try {
            const url = await uploadBase64ToSupabase(base64Src, processedImages.length)
            processedResearch = processedResearch.replace(base64Src, url)
          } catch {
            // 替换失败则保留原样
          }
        }
      }

      const body: Record<string, unknown> = {
        name: formData.name.trim(),
        description: processedDesc,
        images: processedImages,
        retailPrice: rp,
        memberPrice: mp,
        stock: parseInt(formData.stock) || 0,
        isUpgradeProduct: formData.isUpgradeProduct,
        maxPointsRatio: parseInt(formData.maxPointsRatio) || 0,
        benefits: formData.benefits,
        status: formData.status === 'active' ? 'active' : 'inactive',
        sortOrder: parseInt(formData.sortOrder) || 0,
        categoryId: formData.categoryId || null,
        specs: formData.specs.filter(s => s.name.trim()),
        research: processedResearch,
        videoUrl: formData.videoUrl || null,
      }

      const url = editingId
        ? `/api/admin/products/${editingId}`
        : '/api/admin/products'
      const method = editingId ? 'PUT' : 'POST'

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
        fetchProducts(token, pagination.page)
      } else {
        showMessage('error', data.message || '保存失败')
      }
    } catch (error) {
      logger.error('保存商品失败:', error)
      showMessage('error', '网络错误，请重试')
    } finally {
      setSaving(false)
    }
  }

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
        setDeleteTarget(null)
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

  const toggleStatus = async (product: Product) => {
    if (!token) return
    const newStatus = product.status === 'active' ? 'inactive' : 'active'
    try {
      const res = await fetch(`/api/admin/products/${product.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json()
      if (data.success) {
        showMessage('success', `商品已${newStatus === 'active' ? '上架' : '下架'}`)
        fetchProducts(token, pagination.page)
      } else {
        showMessage('error', data.message || '操作失败')
      }
    } catch {
      showMessage('error', '网络错误，请重试')
    }
  }

  const handleToggleSelectAll = () => {
    if (isAllCurrentPageSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        currentPageIds.forEach(id => next.delete(id))
        return next
      })
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev)
        currentPageIds.forEach(id => next.add(id))
        return next
      })
    }
  }

  const handleToggleSelectOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleClearSelection = () => {
    setSelectedIds(new Set())
  }

  const handleBulkUpdate = async (newStatus: 'active' | 'inactive') => {
    if (!token || selectedIds.size === 0) return
    const actionText = newStatus === 'active' ? '上架' : '下架'
    if (!confirm(`确认${actionText}已选的 ${selectedIds.size} 个商品？`)) return

    setBulkLoading(true)
    try {
      const res = await fetch('/api/admin/products/bulk', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          status: newStatus,
        }),
      })
      const data = await res.json()
      if (data.success) {
        showMessage('success', data.message || `已${actionText} ${data.data?.updated || 0} 个商品`)
        setSelectedIds(new Set())
        fetchProducts(token, pagination.page)
      } else {
        showMessage('error', data.message || `批量${actionText}失败`)
      }
    } catch {
      showMessage('error', '网络错误，请重试')
    } finally {
      setBulkLoading(false)
    }
  }

  // ---- Render ----

  return (
    <>
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

      {/* 商品列表 */}
      <ProductTable
        products={products}
        pagination={pagination}
        loading={loading}
        search={search}
        setSearch={setSearch}
        filterUpgrade={filterUpgrade}
        setFilterUpgrade={setFilterUpgrade}
        filterStatus={filterStatus}
        setFilterStatus={setFilterStatus}
        lowStockOnly={lowStockOnly}
        setLowStockOnly={setLowStockOnly}
        lowStockCount={lowStockCount}
        selectedIds={selectedIds}
        isAllCurrentPageSelected={isAllCurrentPageSelected}
        bulkLoading={bulkLoading}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
        duplicatingId={duplicatingId}
        handleSearch={handleSearch}
        handlePageChange={handlePageChange}
        handleToggleSelectAll={handleToggleSelectAll}
        handleToggleSelectOne={handleToggleSelectOne}
        handleClearSelection={handleClearSelection}
        handleBulkUpdate={handleBulkUpdate}
        handleEdit={handleEdit}
        handleDuplicate={handleDuplicate}
        onDeleteRequest={(product) => {
          setDeleteTarget(product)
          setDeleteId(product.id)
        }}
        toggleStatus={toggleStatus}
        showMessage={showMessage}
        stripHtmlTags={stripHtmlTags}
        onAdd={handleAdd}
      />

      {/* 新增/编辑商品弹窗 */}
      {showModal && (
        <ProductForm
          editingId={editingId}
          formData={formData}
          setFormData={setFormData}
          saving={saving}
          categories={categories}
          buildCategoryOptions={buildCategoryOptions}
          handleSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* v68.7: 删除确认弹窗 */}
      <ConfirmDialog
        open={!!deleteId && !!deleteTarget}
        title="确认删除商品"
        mode="emphasize"
        message={
          <div className="space-y-3">
            <p className="leading-relaxed">
              你正在删除商品<span className="font-semibold text-red-600">《{deleteTarget?.name}》</span>,
              <br />
              <span className="text-red-600 font-medium">此操作不可撤销，商品关联的所有数据将被彻底删除。</span>
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
              <p className="font-medium mb-1">删除前请确认:</p>
              <ul className="space-y-0.5 list-disc list-inside">
                <li>商品已下架，无在途订单关联</li>
                <li>商品不再在前台展示</li>
                <li>运营报表数据保留但商品项消失</li>
              </ul>
            </div>
          </div>
        }
        confirmText="我已确认，删除此商品"
        cancelText="取消"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteId(null)
          setDeleteTarget(null)
        }}
      />
    </>
  )
}
