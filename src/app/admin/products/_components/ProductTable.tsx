'use client'

import Image from 'next/image'
import {
  Package, Plus, Search, Edit2, Trash2, Loader2,
  ChevronLeft, ChevronRight, Image as ImageIcon, ToggleLeft, ToggleRight,
  ClipboardCopy,
  AlertTriangle, CheckSquare, Square, CheckCheck, XCircle,
} from 'lucide-react'

// ---- 共有类型 ----

export interface Product {
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
  specs: { name: string; values: string[] }[] | null
  research: string | null
  videoUrl: string | null
  category: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
}

export interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

const LOW_STOCK_THRESHOLD = 10

// ---- Props ----

interface ProductTableProps {
  products: Product[]
  pagination: Pagination
  loading: boolean
  search: string
  setSearch: React.Dispatch<React.SetStateAction<string>>
  filterUpgrade: string
  setFilterUpgrade: React.Dispatch<React.SetStateAction<string>>
  filterStatus: string
  setFilterStatus: React.Dispatch<React.SetStateAction<string>>
  lowStockOnly: boolean
  setLowStockOnly: React.Dispatch<React.SetStateAction<boolean>>
  lowStockCount: number
  selectedIds: Set<string>
  isAllCurrentPageSelected: boolean
  bulkLoading: boolean
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  duplicatingId: string | null
  handleSearch: () => void
  handlePageChange: (newPage: number) => void
  handleToggleSelectAll: () => void
  handleToggleSelectOne: (id: string) => void
  handleClearSelection: () => void
  handleBulkUpdate: (newStatus: 'active' | 'inactive') => Promise<void>
  handleEdit: (product: Product) => void
  handleDuplicate: (product: Product) => void
  onDeleteRequest: (product: Product) => void
  toggleStatus: (product: Product) => Promise<void>
  showMessage: (type: 'success' | 'error', text: string) => void
  stripHtmlTags: (html: string) => string
  onAdd: () => void
}

export default function ProductTable({
  products,
  pagination,
  loading,
  search,
  setSearch,
  filterUpgrade,
  setFilterUpgrade,
  filterStatus,
  setFilterStatus,
  lowStockOnly,
  setLowStockOnly,
  lowStockCount,
  selectedIds,
  isAllCurrentPageSelected,
  bulkLoading,
  canCreate,
  canUpdate,
  canDelete,
  duplicatingId,
  handleSearch,
  handlePageChange,
  handleToggleSelectAll,
  handleToggleSelectOne,
  handleClearSelection,
  handleBulkUpdate,
  handleEdit,
  handleDuplicate,
  onDeleteRequest,
  toggleStatus,
  showMessage,
  stripHtmlTags,
  onAdd,
}: ProductTableProps) {

  return (
    <>
      {/* 页面标题 */}
      <div className="flex items-center gap-3 mb-6">
        <Package className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold text-gray-900">商品管理</h1>
      </div>

      {/* 工具栏 */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full sm:w-auto">
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
            <button
              onClick={handleSearch}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700
                transition-colors font-medium whitespace-nowrap"
            >
              搜索
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLowStockOnly(v => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg transition-colors font-medium whitespace-nowrap border ${
                lowStockOnly
                  ? 'bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400'
              }`}
              title="仅显示库存 ≤ 10 的商品"
            >
              <AlertTriangle className={`w-4 h-4 ${lowStockOnly ? 'text-orange-500' : 'text-gray-400'}`} />
              低库存
              {lowStockCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-orange-200 text-orange-800">{lowStockCount}</span>
              )}
            </button>
            <button
              onClick={onAdd}
              disabled={!canCreate}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg
                hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              title={!canCreate ? '无创建权限' : '新增商品'}
            >
              <Plus className="w-4 h-4" />
              新增
            </button>
          </div>
        </div>
      </div>

      {/* 批量操作栏 */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCheck className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-medium text-blue-700">
              已选择 <span className="font-bold">{selectedIds.size}</span> 个商品
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBulkUpdate('active')}
              disabled={bulkLoading}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-green-600 text-white
                rounded-md hover:bg-green-700 transition-colors font-medium disabled:opacity-50"
            >
              批量上架
            </button>
            <button
              onClick={() => handleBulkUpdate('inactive')}
              disabled={bulkLoading}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-yellow-600 text-white
                rounded-md hover:bg-yellow-700 transition-colors font-medium disabled:opacity-50"
            >
              批量下架
            </button>
            <button
              onClick={handleClearSelection}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600
                bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors font-medium"
            >
              清除选择
            </button>
          </div>
        </div>
      )}

      {/* 商品表格 */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-3 text-left w-[40px]">
                    <button
                      onClick={handleToggleSelectAll}
                      className="flex items-center justify-center w-5 h-5 rounded transition-colors hover:bg-gray-200"
                      title={isAllCurrentPageSelected ? '取消全选当前页' : '全选当前页'}
                    >
                      {isAllCurrentPageSelected ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </th>
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
                {(() => {
                  const displayProducts = lowStockOnly
                    ? products.filter(p => p.stock <= LOW_STOCK_THRESHOLD)
                    : products
                  if (displayProducts.length === 0) {
                    return (
                      <tr>
                        <td colSpan={10} className="px-4 py-20 text-center text-gray-400">
                          {lowStockOnly ? (
                            <div className="flex flex-col items-center gap-2">
                              <AlertTriangle className="w-10 h-10 text-gray-300" />
                              <p>当前页暂无低库存商品</p>
                              <button
                                onClick={() => setLowStockOnly(false)}
                                className="text-sm text-blue-600 hover:underline"
                              >
                                查看全部商品 →
                              </button>
                            </div>
                          ) : '暂无商品数据'}
                        </td>
                      </tr>
                    )
                  }
                  return displayProducts.map(product => {
                    const isSelected = selectedIds.has(product.id)
                    const isLowStock = product.stock > 0 && product.stock <= LOW_STOCK_THRESHOLD
                    const isOutOfStock = product.stock === 0
                    return (
                      <tr
                        key={product.id}
                        className={`hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50/60' : ''} ${
                          isOutOfStock ? 'bg-red-50/30' : isLowStock ? 'bg-orange-50/30' : ''
                        }`}
                      >
                        <td className="px-3 py-3">
                          <button
                            onClick={() => handleToggleSelectOne(product.id)}
                            className="flex items-center justify-center w-5 h-5 rounded transition-colors hover:bg-gray-200"
                            title={isSelected ? '取消选择' : '选择此商品'}
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-blue-600" />
                            ) : (
                              <Square className="w-4 h-4 text-gray-400" />
                            )}
                          </button>
                        </td>
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
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{product.name}</div>
                          {product.description && (
                            <div className="text-xs text-gray-400 mt-0.5 line-clamp-1" title={stripHtmlTags(product.description)}>
                              {stripHtmlTags(product.description).slice(0, 50)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                            {product.category?.name || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-medium text-gray-800">
                            ¥{product.retailPrice.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-sm font-medium ${product.memberPrice < product.retailPrice ? 'text-green-600' : 'text-gray-800'}`}>
                            ¥{product.memberPrice.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-sm font-medium ${
                            isOutOfStock ? 'text-red-600' : isLowStock ? 'text-orange-600' : 'text-gray-700'
                          }`}>
                            {isOutOfStock && <XCircle className="w-3.5 h-3.5" />}
                            {product.stock}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${
                            product.isUpgradeProduct
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}>
                            {product.isUpgradeProduct ? '是' : '否'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleStatus(product)}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                              product.status === 'active'
                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                          >
                            {product.status === 'active' ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                            {product.status === 'active' ? '上架' : '下架'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right min-w-[300px]">
                          <div className="flex flex-wrap items-center justify-end gap-1.5 pl-3 whitespace-nowrap">
                            <button
                              onClick={() => handleDuplicate(product)}
                              disabled={!canCreate || duplicatingId === product.id}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed min-h-[28px]"
                              title="复制商品"
                            >
                              <ClipboardCopy className="w-3.5 h-3.5" />
                              复制
                            </button>
                            <button
                              onClick={() => {
                                if (!canUpdate) { showMessage('error', '你没有修改权限，请联系超级管理员'); return }
                                handleEdit(product)
                              }}
                              disabled={!canUpdate}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed min-h-[28px]"
                              title={!canUpdate ? '无修改权限' : '编辑商品'}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              编辑
                            </button>
                            <button
                              onClick={() => {
                                if (!canDelete) { showMessage('error', '你没有删除权限，请联系超级管理员'); return }
                                onDeleteRequest(product)
                              }}
                              disabled={!canDelete}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed min-h-[28px]"
                              title={!canDelete ? '无删除权限' : '删除商品'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                })()}
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
                  if (pagination.totalPages <= 7) return true
                  return Math.abs(p - pagination.page) <= 2 || p === 1 || p === pagination.totalPages
                })
                .map((p, idx, arr) => {
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
    </>
  )
}
